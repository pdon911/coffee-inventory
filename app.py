import os
import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from datetime import datetime, timezone
import time
import threading

load_dotenv()

print("--- STARTING COFFEE VILLAIN BACKEND ---", flush=True)
print(f"DEBUG: APP_PIN length: {len(os.environ.get('APP_PIN', ''))}", flush=True)
print(f"DEBUG: DATABASE_URL exists: {bool(os.environ.get('DATABASE_URL'))}", flush=True)

app = Flask(__name__)

# --- CACHE ---
_catalog_cache = None # Processed items with categories/images (no quantities)
_inventory_cache = {} # var_id -> quantity
_cache_last_updated = 0
CACHE_DURATION = 300 # 5 minutes


# --- CONFIGURATION ---
SQUARE_ACCESS_TOKEN = os.environ.get("SQUARE_ACCESS_TOKEN")
DATABASE_URL = os.environ.get("DATABASE_URL")
# A default location ID to use if not specified in the request. You should replace this with a valid location ID from your Square account.
SQUARE_LOCATION_ID = os.environ.get("SQUARE_LOCATION_ID")
# Optional channel ID to filter by Point of Sale availability
SQUARE_POS_CHANNEL_ID = os.environ.get("SQUARE_POS_CHANNEL_ID", "CH_z3KuPRWX9HaaCUp1nS1etFM1PHAcIE3M6AqpEUR29945o")
# Robust loading of APP_PIN: convert to string and strip whitespace
APP_PIN = str(os.environ.get("APP_PIN", "")).strip() or None


# Fix for Neon DB URL
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL or 'sqlite:///local.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- DATABASE MODELS ---
class Favorite(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.String(100), unique=True, nullable=False)

# Safely initialize database
try:
    with app.app_context():
        print("DEBUG: Attempting to create database tables...", flush=True)
        db.create_all()
        print("DEBUG: Database initialization successful.", flush=True)
except Exception as e:
    print(f"ERROR: Database initialization failed: {e}", flush=True)
    # We don't exit here so the health check and logging can still run

# --- SQUARE API HELPERS ---

def get_square_api_headers():
    return {
        "Authorization": f"Bearer {SQUARE_ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "Square-Version": "2023-10-18"
    }

def get_first_location_id():
    global SQUARE_LOCATION_ID
    if SQUARE_LOCATION_ID:
        return SQUARE_LOCATION_ID
    
    url = "https://connect.squareup.com/v2/locations"
    try:
        response = requests.get(url, headers=get_square_api_headers())
        response.raise_for_status()
        locations = response.json().get('locations', [])
        if locations:
            SQUARE_LOCATION_ID = locations[0]['id']
            print(f"--- Using Square Location ID: {SQUARE_LOCATION_ID} ---")
            return SQUARE_LOCATION_ID
        else:
            raise Exception("No locations found in Square account.")
    except Exception as e:
        print(f"Error fetching Square locations: {e}")
        return None


def get_catalog_structure():
    """Fetches all items, images, and categories to build the app's structure."""
    print("--- Fetching Catalog Structure from Square ---")
    catalog = []
    cursor = None
    url = "https://connect.squareup.com/v2/catalog/list"
    
    while True:
        params = {"types": "ITEM,IMAGE,CATEGORY"}
        if cursor:
            params['cursor'] = cursor

        try:
            response = requests.get(url, headers=get_square_api_headers(), params=params)
            response.raise_for_status()
            data = response.json()
            catalog.extend(data.get('objects', []))
            cursor = data.get('cursor')
            if not cursor:
                break
        except Exception as e:
            print(f"Square API Error fetching catalog: {e}")
            return []
    return catalog

def fetch_inventory_counts(variation_ids):
    """Fetches current inventory counts for a specific list of variation IDs."""
    if not variation_ids:
        return {}
        
    print(f"--- Fetching Inventory Counts for {len(variation_ids)} variations ---")
    inventory_counts = {}
    url = "https://connect.squareup.com/v2/inventory/counts/batch-retrieve"
    
    for i in range(0, len(variation_ids), 1000):
        chunk = variation_ids[i:i + 1000]
        payload = {"catalog_object_ids": chunk, "location_ids": [SQUARE_LOCATION_ID]}
        try:
            response = requests.post(url, headers=get_square_api_headers(), json=payload)
            response.raise_for_status()
            counts = response.json().get('counts', [])
            for count in counts:
                if count.get('state') == 'IN_STOCK':
                    inventory_counts[count['catalog_object_id']] = int(count['quantity'])
        except Exception as e:
            print(f"Square API Error fetching inventory counts: {e}")
            
    return inventory_counts

def search_for_image(item_data, image_map):
    """Find the thumbnail URL for an item, checking variations if needed."""
    # 1. Check the main item for images
    if item_data.get('image_ids'):
        for image_id in item_data['image_ids']:
            if image_id in image_map:
                return image_map[image_id]
    
    # 2. If no image yet, check the variations
    for var in item_data.get('variations', []):
        var_data = var.get('item_variation_data', {})
        if var_data.get('image_ids'):
            for image_id in var_data['image_ids']:
                if image_id in image_map:
                    return image_map[image_id]
    return None

def format_data_for_frontend(catalog, inventory_counts):
    items_map = {}
    image_map = {
        obj['id']: obj.get('image_data', {}).get('url')
        for obj in catalog
        if obj['type'] == 'IMAGE' and obj.get('image_data', {}).get('url')
    }
    
    # Filter categories by location
    category_map = {}
    for obj in catalog:
        if obj['type'] == 'CATEGORY':
            is_present = obj.get('present_at_all_locations', False) or \
                         (SQUARE_LOCATION_ID and SQUARE_LOCATION_ID in obj.get('present_at_location_ids', []))
            is_absent = SQUARE_LOCATION_ID and SQUARE_LOCATION_ID in obj.get('absent_at_location_ids', [])
            
            if SQUARE_LOCATION_ID and (not is_present or is_absent):
                continue
                
            name = obj.get('category_data', {}).get('name')
            if name:
                category_map[obj['id']] = name

    for obj in catalog:
        if obj['type'] == 'ITEM':
            # Filter by location if SQUARE_LOCATION_ID is set
            is_present = obj.get('present_at_all_locations', False) or \
                         (SQUARE_LOCATION_ID and SQUARE_LOCATION_ID in obj.get('present_at_location_ids', []))
            
            is_absent = SQUARE_LOCATION_ID and SQUARE_LOCATION_ID in obj.get('absent_at_location_ids', [])
            
            if SQUARE_LOCATION_ID and (not is_present or is_absent):
                continue

            item_data = obj.get('item_data', {})
            
            if item_data.get('is_archived'):
                continue
            
            # Filter by product type (default to REGULAR if missing)
            if item_data.get('product_type') not in ['REGULAR', None]:
                continue
            
            # Filter by POS channel if configured
            # If an item has channel restrictions, it must include the POS channel
            item_channels = item_data.get('channels', [])
            if SQUARE_POS_CHANNEL_ID and item_channels and SQUARE_POS_CHANNEL_ID not in item_channels:
                continue
            
            # If item has a category, ensure the category is available at this location
            category_id = item_data.get('category_id')
            if category_id and category_id not in category_map:
                continue

            item_id = obj['id']

            is_complex = len(item_data.get('variations', [])) > 1
            image_url = search_for_image(item_data, image_map)
            
            variations_data = []
            for var in item_data.get('variations', []):
                var_data = var.get('item_variation_data', {})
                var_id = var['id']
                
                # Check location overrides for track_inventory
                track_inventory = var_data.get('track_inventory', False)
                if SQUARE_LOCATION_ID and var_data.get('location_overrides'):
                    for override in var_data.get('location_overrides'):
                        if override.get('location_id') == SQUARE_LOCATION_ID:
                            if 'track_inventory' in override:
                                track_inventory = override['track_inventory']
                            break

                variations_data.append({
                    "id": var_id,
                    "name": var_data.get('name', 'Regular'),
                    "quantity": inventory_counts.get(var_id, 0),
                    "trackInventory": track_inventory
                })

            items_map[item_id] = {
                "id": item_id,
                "name": item_data.get('name'),
                "category": category_map.get(item_data.get('category_id')) or "Uncategorized",
                "thumbnail_url": image_url,
                "isStarred": False,
                "type": 'Complex' if is_complex else 'Simple',
                "variations": variations_data,
            }
            
    return list(items_map.values())


# --- ROUTES ---

@app.before_request
def check_pin():
    # Only protect API routes
    if request.path.startswith('/api/'):
        # Allow the verify-pin and health endpoints
        if request.path in ['/api/verify-pin', '/api/health']:
            return
        
        # If no PIN is configured, allow all (optional, but safer to require it if configured)
        if not APP_PIN:
            return

        pin = str(request.headers.get('X-App-Pin', '')).strip()
        if pin != APP_PIN:
            return jsonify({"error": "Unauthorized", "message": "Invalid PIN"}), 401

@app.route('/api/verify-pin', methods=['POST'])
def verify_pin():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        pin = str(data.get('pin', '')).strip()
        
        if not APP_PIN:
            print("DEBUG: PIN Verification called, but APP_PIN is not set in environment.")
            return jsonify({"success": True, "message": "No PIN configured"})
            
        if pin == APP_PIN:
            print("DEBUG: PIN Verification successful.")
            return jsonify({"success": True})
        else:
            # Log basic debug info without exposing the PIN itself
            print(f"DEBUG: PIN Verification failed. Expected Length: {len(APP_PIN)}, Received Length: {len(pin)}")
            return jsonify({"success": False, "message": "Invalid PIN"}), 401
    except Exception as e:
        print(f"ERROR in verify_pin: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/health')
def health_check():
    db_status = "connected"
    try:
        # Simple query to check DB connectivity
        Favorite.query.first()
    except Exception as e:
        db_status = f"error: {str(e)}"
        
    return jsonify({
        "status": "healthy", 
        "database": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pin_configured": bool(APP_PIN)
    })

@app.route('/api/inventory')
def api_inventory():
    global _catalog_cache, _inventory_cache, _cache_last_updated
    
    favorites_only = request.args.get('favorites_only') == 'true'
    
    # Check if we need to refresh the full catalog cache
    if not _catalog_cache or (time.time() - _cache_last_updated > CACHE_DURATION):
        _catalog_cache = get_catalog_structure()
        _cache_last_updated = time.time()
        # On full catalog refresh, we clear inventory cache to ensure fresh counts
        _inventory_cache = {}

    if not _catalog_cache:
        return jsonify([])

    # Add favorite status (always fresh from DB)
    try:
        favorites_ids = {f.item_id for f in Favorite.query.all()}
    except Exception as e:
        print(f"Database error fetching favorites: {e}")
        return jsonify({"error": "Database error"}), 500

    if favorites_only:
        # 1. Identify variations for favorite items only
        favorite_var_ids = []
        for obj in _catalog_cache:
            if obj['type'] == 'ITEM' and obj['id'] in favorites_ids:
                for var in obj.get('item_data', {}).get('variations', []):
                    favorite_var_ids.append(var['id'])

        # 2. Fetch LIVE inventory counts for just these favorites
        fav_inventory = fetch_inventory_counts(favorite_var_ids)
        
        # 3. Format just these items
        clean_items = format_data_for_frontend(_catalog_cache, fav_inventory)
        clean_items = [item for item in clean_items if item['id'] in favorites_ids]
        
        for item in clean_items:
            item['isStarred'] = True
            
        return jsonify(clean_items)

    else:
        # Full library requested
        # Check if we need to refresh all inventory counts
        if not _inventory_cache:
            all_var_ids = []
            for obj in _catalog_cache:
                if obj['type'] == 'ITEM':
                    for var in obj.get('item_data', {}).get('variations', []):
                        all_var_ids.append(var['id'])
            _inventory_cache = fetch_inventory_counts(all_var_ids)
            
        clean_items = format_data_for_frontend(_catalog_cache, _inventory_cache)
        for item in clean_items:
            item['isStarred'] = item['id'] in favorites_ids
            
        return jsonify(clean_items)

@app.route('/api/inventory/sync', methods=['POST'])
def sync_inventory():
    """Forces a refresh of the server's cache from the Square API."""
    global _catalog_cache, _inventory_cache, _cache_last_updated
    
    _catalog_cache = get_catalog_structure()
    _inventory_cache = {} # Force refresh on next request
    _cache_last_updated = time.time()
    
    return jsonify({"success": True, "message": "Cache has been refreshed."})



@app.route('/api/toggle-star', methods=['POST'])
def toggle_star():
    data = request.json
    item_id = data.get('id')
    if not item_id:
        return jsonify({"error": "Item ID is required"}), 400

    existing = Favorite.query.filter_by(item_id=item_id).first()
    if existing:
        db.session.delete(existing)
        starred = False
    else:
        new_fav = Favorite(item_id=item_id)
        db.session.add(new_fav)
        starred = True
        
    db.session.commit()
    return jsonify({"success": True, "is_starred": starred})


@app.route('/api/inventory/track', methods=['POST'])
def enable_inventory_tracking():
    variation_id = request.json.get('variationId')
    if not variation_id:
        return jsonify({"error": "Variation ID is required"}), 400

    # First, get the variation to know its current version and item ID
    url = f"https://connect.squareup.com/v2/catalog/object/{variation_id}"
    try:
        response = requests.get(url, headers=get_square_api_headers())
        response.raise_for_status()
        obj = response.json().get('object')
        if not obj:
            return jsonify({"error": "Variation not found"}), 404
        
        # Update track_inventory to True
        obj['item_variation_data']['track_inventory'] = True
        
        # Upsert the catalog object
        update_url = "https://connect.squareup.com/v2/catalog/object"
        update_payload = {
            "idempotency_key": f"track-{variation_id}-{int(time.time())}",
            "object": obj
        }
        update_response = requests.post(update_url, headers=get_square_api_headers(), json=update_payload)
        update_response.raise_for_status()
        
        # Force cache refresh
        global _catalog_cache, _inventory_cache, _cache_last_updated
        _catalog_cache = None
        _inventory_cache = {}
        _cache_last_updated = 0
        
        return jsonify({"success": True, "message": "Inventory tracking enabled."})
    except Exception as e:
        print(f"Error enabling inventory tracking: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/inventory/update', methods=['POST'])
def batch_update_inventory():
    changes = request.json.get('changes')
    if not changes:
        return jsonify({"error": "No changes provided"}), 400

    if not SQUARE_LOCATION_ID:
        return jsonify({"error": "Server is not configured with a Square Location ID."}), 500

    # idempotency_key ensures the request is not processed multiple times
    idempotency_key = request.headers.get('Idempotency-Key')
    if not idempotency_key:
         return jsonify({"error": "Idempotency-Key header is required"}), 400

    # To ensure multi-device sync, we want to perform relative updates.
    # We fetch the latest counts from Square right before updating.
    variation_ids = [c['variationId'] for c in changes]
    
    current_counts = {}
    try:
        counts_url = "https://connect.squareup.com/v2/inventory/counts/batch-retrieve"
        counts_payload = {"catalog_object_ids": variation_ids, "location_ids": [SQUARE_LOCATION_ID]}
        counts_response = requests.post(counts_url, headers=get_square_api_headers(), json=counts_payload)
        counts_response.raise_for_status()
        counts_data = counts_response.json().get('counts', [])
        for count in counts_data:
            if count.get('state') == 'IN_STOCK':
                current_counts[count['catalog_object_id']] = int(count['quantity'])
    except Exception as e:
        print(f"Error fetching current counts for update: {e}")
        # Continue with 0 as base if fetch fails

    url = "https://connect.squareup.com/v2/inventory/changes/batch-create"
    
    square_changes = []
    occurred_at = datetime.now(timezone.utc).isoformat()
    
    for change in changes:
        var_id = change['variationId']
        new_qty = change['quantity']
        
        square_changes.append({
            "type": "PHYSICAL_COUNT",
            "physical_count": {
                "catalog_object_id": var_id,
                "state": "IN_STOCK",
                "location_id": SQUARE_LOCATION_ID,
                "quantity": str(max(0, int(new_qty))),
                "occurred_at": occurred_at
            }
        })

    payload = {
        "idempotency_key": idempotency_key,
        "changes": square_changes,
        "ignore_unchanged_counts": True
    }

    try:
        response = requests.post(url, headers=get_square_api_headers(), json=payload)
        response.raise_for_status()
        
        # Force inventory cache refresh after update
        global _inventory_cache
        _inventory_cache = {}
        
        return jsonify({"success": True, "data": response.json()})
    except requests.exceptions.HTTPError as e:
        error_details = e.response.json()
        print(f"Square API Error updating inventory: {error_details}")
        return jsonify({"error": "Failed to update Square inventory", "details": error_details}), e.response.status_code
    except Exception as e:
        print(f"Generic error updating inventory: {e}")
        return jsonify({"error": "An unexpected error occurred."}), 500


@app.route('/')
def index():
    return send_from_directory('dist', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    # Security: prevent access to sensitive backend files
    if path.endswith('.py') or path.endswith('.env') or path.endswith('.db'):
        return jsonify({"error": "Access denied"}), 403
    return send_from_directory('dist', path)

def background_sync():
    """A simple background thread to keep the cache warm."""
    print("--- Starting background sync thread ---")
    while True:
        with app.app_context(): # Create an app context for the db call
            global _catalog_cache, _inventory_cache, _cache_last_updated
            _catalog_cache = get_catalog_structure()
            _inventory_cache = {} # Will be re-fetched on next request
            _cache_last_updated = time.time()
            print("--- Background catalog sync completed. ---")
        time.sleep(CACHE_DURATION)

# Start the background thread on import so it runs with Gunicorn
# But avoid double-start during Flask local development
if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not os.environ.get("FLASK_DEBUG"):
    sync_thread = threading.Thread(target=background_sync, daemon=True)
    sync_thread.start()

if __name__ == '__main__':
    # Get location ID on startup before starting the sync thread
    with app.app_context():
        get_first_location_id()
    
    # # Start the background thread
    # sync_thread = threading.Thread(target=background_sync, daemon=True)
    # sync_thread.start()

    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
