import os
import requests
from flask import Flask, render_template, jsonify, request
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__, template_folder='templates')

# --- CONFIGURATION ---
SQUARE_ACCESS_TOKEN = os.environ.get("SQUARE_ACCESS_TOKEN")
DATABASE_URL = os.environ.get("DATABASE_URL")
APP_PIN = os.environ.get("APP_PIN")

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
def get_square_catalog():
    # Defines a function to retrieve catalog data from the Square API.
    if not SQUARE_ACCESS_TOKEN:
        return {"objects": []}
    
    url = "https://connect.squareup.com/v2/catalog/list"
    headers = {
        "Authorization": f"Bearer {SQUARE_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    params = {"types": "ITEM,IMAGE"}
    
    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Square API Error: {e}")
        return {"objects": []}

def format_items_for_frontend(catalog_data):
    items = []
    image_map = {}
    
    for obj in catalog_data.get('objects', []):
        if obj['type'] == 'IMAGE':
            image_map[obj['id']] = obj['image_data']['url']

    for obj in catalog_data.get('objects', []):
        if obj['type'] == 'ITEM':
            item_data = obj.get('item_data', {})
            image_id = item_data.get('image_ids', [None])[0]
            
            variations = []
            for var in item_data.get('variations', []):
                var_data = var.get('item_variation_data', {})
                variations.append({
                    "id": var['id'],
                    "name": var_data.get('name'),
                    "sku": var_data.get('sku', '')
                })

            items.append({
                "id": obj['id'],
                "name": item_data.get('name'),
                "category_id": item_data.get('category_id'),
                "image_url": image_map.get(image_id),
                "variations": variations
            })
    return items

# --- ROUTES ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/check-pin', methods=['POST'])
def check_pin():
    data = request.json
    if str(data.get('pin')) == str(APP_PIN):
        return jsonify({"success": True})
    return jsonify({"success": False}), 401

@app.route('/api/catalog')
def api_catalog():
    raw_data = get_square_catalog()
    clean_items = format_items_for_frontend(raw_data)
    
    try:
        favorites = [f.item_id for f in Favorite.query.all()]
        for item in clean_items:
            item['is_starred'] = item['id'] in favorites
    except:
        pass
    
    return jsonify(clean_items)

@app.route('/api/toggle-star', methods=['POST'])
def toggle_star():
    data = request.json
    item_id = data.get('item_id')
    
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

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)