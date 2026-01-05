import os
import requests
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from datetime import datetime, timezone

load_dotenv()

app = Flask(__name__)

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
    # 1. Fetch Catalog Items, Images, and Categories
    url = "https://connect.squareup.com/v2/catalog/list"
    params = {"types": "ITEM,IMAGE,CATEGORY"}
    
    try:
        response = requests.get(url, headers=get_square_api_headers(), params=params)
        response.raise_for_status()
        catalog = response.json().get('objects', [])
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

    # 3. Fetch Inventory Counts for all variations
    url = "https://connect.squareup.com/v2/inventory/counts/batch-retrieve"
    inventory_payload = {"catalog_object_ids": variation_ids}
    inventory_counts = {}
    try:
        response = requests.post(url, headers=get_square_api_headers(), json=inventory_payload)
        response.raise_for_status()
        counts = response.json().get('counts', [])
        for count in counts:
            # We only care about 'IN_STOCK'
            if count.get('state') == 'IN_STOCK':
                inventory_counts[count['catalog_object_id']] = int(count['quantity'])
    except Exception as e:
        print(f"Square API Error fetching inventory: {e}")
        # Continue without inventory data if this fails

    return catalog, inventory_counts

def format_data_for_frontend(catalog, inventory_counts):
    items_map = {}
    image_map = {
        obj['id']: obj['image_data']['url'] 
        for obj in catalog 
        if obj['type'] == 'IMAGE' and obj.get('image_data', {}).get('url')
    }
    category_map = {obj['id']: obj['category_data']['name'] for obj in catalog if obj['type'] == 'CATEGORY'}

    for obj in catalog:
        if obj['type'] == 'ITEM':
            item_data = obj['item_data']
            item_id = obj['id']

            # Determine product type
            is_complex = len(item_data.get('variations', [])) > 1
            
            variations_data = []
            for var in item_data.get('variations', []):
                var_id = var['id']
                variations_data.append({
                    "id": var_id,
                    "name": var['item_variation_data'].get('name', 'Regular'),
                    "quantity": inventory_counts.get(var_id, 0)
                })

            # For simple products, we'll store quantity at the top level.
            simple_quantity = None
            if not is_complex and variations_data:
                simple_quantity = variations_data[0]['quantity']

            # Find the first available image URL
            image_url = None
            # 1. Check the main item for images
            if item_data.get('image_ids'):
                image_url = image_map.get(item_data['image_ids'][0])
            
            # 2. If no image yet, check the variations
            if not image_url:
                for var in item_data.get('variations', []):
                    var_data = var.get('item_variation_data', {})
                    if var_data.get('image_ids'):
                        image_url = image_map.get(var_data['image_ids'][0])
                        if image_url:
                            break # Stop once we find the first image

            items_map[item_id] = {
                "id": item_id,
                "name": item_data.get('name'),
                "category": category_map.get(item_data.get('category_id')),
                "imageUrl": image_url,
                "isStarred": False, # Placeholder, will be updated later
                "type": 'Complex' if is_complex else 'Simple',
                "variations": variations_data,
                "quantity": simple_quantity if not is_complex else None
            }
            
    return list(items_map.values())

# --- ROUTES ---

@app.route('/api/inventory')
def api_inventory():
    # Ensure we have a location ID to work with
    if not SQUARE_LOCATION_ID:
        if not get_first_location_id():
            return jsonify({"error": "Could not determine Square Location ID."}), 500

    catalog, inventory = get_full_catalog_with_inventory()
    if not catalog:
        return jsonify([])

    clean_items = format_data_for_frontend(catalog, inventory)
    
    # Add favorite status
    try:
        favorites = {f.item_id for f in Favorite.query.all()}
        for item in clean_items:
            if item['id'] in favorites:
                item['isStarred'] = True
    except Exception as e:
        print(f"Database error fetching favorites: {e}")
        # Continue without favorites if DB fails
    
    return jsonify(clean_items)


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


if __name__ == '__main__':
    # Get location ID on startup
    get_first_location_id()
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)