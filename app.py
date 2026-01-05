import os
import requests
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from datetime import datetime, timezone
import time
import threading

load_dotenv()

app = Flask(__name__)

# --- CACHE ---
_cache = None
_cache_last_updated = 0
CACHE_DURATION = 300 # 5 minutes


# --- CONFIGURATION ---
SQUARE_ACCESS_TOKEN = os.environ.get("SQUARE_ACCESS_TOKEN")
DATABASE_URL = os.environ.get("DATABASE_URL")
# A default location ID to use if not specified in the request. You should replace this with a valid location ID from your Square account.
SQUARE_LOCATION_ID = os.environ.get("SQUARE_LOCATION_ID")


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

with app.app_context():
    db.create_all()

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


def get_full_catalog_with_inventory():
    # 1. Fetch all pages of Catalog Items, Images, and Categories
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
                break  # Exit loop if no more pages
        except Exception as e:
            print(f"Square API Error fetching catalog: {e}")
            return [], {}

    # 2. Extract variation IDs for inventory check
    variation_ids = []
    for obj in catalog:
        if obj['type'] == 'ITEM':
            for var in obj.get('item_data', {}).get('variations', []):
                variation_ids.append(var['id'])

    if not variation_ids:
        return [], {}

    # 3. Fetch Inventory Counts in chunks of 1000
    inventory_counts = {}
    url = "https://connect.squareup.com/v2/inventory/counts/batch-retrieve"
    
    for i in range(0, len(variation_ids), 1000):
        chunk = variation_ids[i:i + 1000]
        inventory_payload = {"catalog_object_ids": chunk}
        try:
            response = requests.post(url, headers=get_square_api_headers(), json=inventory_payload)
            response.raise_for_status()
            counts = response.json().get('counts', [])
            for count in counts:
                if count.get('state') == 'IN_STOCK':
                    inventory_counts[count['catalog_object_id']] = int(count['quantity'])
        except Exception as e:
            print(f"Square API Error fetching inventory chunk: {e}")
            # Continue without inventory data for this chunk if it fails
            
    return catalog, inventory_counts

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

def get_and_process_data():
    """
    Fetches the full catalog from Square, formats it for the frontend,
    and returns it.
    """
    print("--- Fetching fresh data from Square API ---")
    catalog, inventory = get_full_catalog_with_inventory()
    if not catalog:
        return []
    
    clean_items = format_data_for_frontend(catalog, inventory)
    return clean_items



# --- ROUTES ---

@app.route('/api/inventory')
def api_inventory():
    global _cache, _cache_last_updated
    
    # Check if cache is valid
    if _cache and (time.time() - _cache_last_updated < CACHE_DURATION):
        print("--- Serving from cache ---")
        clean_items = _cache
    else:
        clean_items = get_and_process_data()
        _cache = clean_items
        _cache_last_updated = time.time()

    # Add favorite status (this needs to be fresh on every request)
    try:
        favorites = {f.item_id for f in Favorite.query.all()}
        for item in clean_items:
            # Default to False, then set to True if in favorites
            item['isStarred'] = item['id'] in favorites
    except Exception as e:
        print(f"Database error fetching favorites: {e}")
        return jsonify({"error": "Database error fetching favorites"}), 500
    
    return jsonify(clean_items)

@app.route('/api/inventory/sync', methods=['POST'])
def sync_inventory():
    """Forces a refresh of the server's cache from the Square API."""
    global _cache, _cache_last_updated
    
    clean_items = get_and_process_data()
    _cache = clean_items
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

    url = "https://connect.squareup.com/v2/inventory/changes/batch-create"
    
    square_changes = []
    for change in changes:
        square_changes.append({
            "type": "ADJUSTMENT",
            "adjustment": {
                "catalog_object_id": change['variationId'],
                "from_state": "IN_STOCK",
                "to_state": "IN_STOCK",
                "location_id": SQUARE_LOCATION_ID,
                "quantity": str(change['quantity']),
                "occurred_at": datetime.now(timezone.utc).isoformat()
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
        return jsonify({"success": True, "data": response.json()})
    except requests.exceptions.HTTPError as e:
        error_details = e.response.json()
        print(f"Square API Error updating inventory: {error_details}")
        return jsonify({"error": "Failed to update Square inventory", "details": error_details}), e.response.status_code
    except Exception as e:
        print(f"Generic error updating inventory: {e}")
        return jsonify({"error": "An unexpected error occurred."}), 500


def background_sync():
    """A simple background thread to keep the cache warm."""
    print("--- Starting background sync thread ---")
    while True:
        with app.app_context(): # Create an app context for the db call
            global _cache, _cache_last_updated
            clean_items = get_and_process_data()
            _cache = clean_items
            _cache_last_updated = time.time()
            print(f"--- Background sync completed. {len(_cache)} items cached. ---")
        time.sleep(CACHE_DURATION)


if __name__ == '__main__':
    # Get location ID on startup before starting the sync thread
    with app.app_context():
        get_first_location_id()
    
    # Start the background thread
    sync_thread = threading.Thread(target=background_sync, daemon=True)
    sync_thread.start()

    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)