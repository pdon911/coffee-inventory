# Local Development Setup

To run the Coffee Villain Inventory locally, follow these steps:

## Prerequisites
- Python 3.8+
- Node.js 18+
- npm

## Setup Steps

1. **Install Python Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Install Frontend Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   - Copy `.env.example` to `.env`.
   - Fill in your Square API credentials and Gemini API key.
   ```bash
   copy .env.example .env
   ```

4. **Run the Backend (Flask):**
   ```bash
   python app.py
   ```
   The backend will start on `http://localhost:8080`.

5. **Run the Frontend (Vite):**
   In a *separate* terminal window:
   ```bash
   npm run dev
   ```
   The frontend will start on `http://localhost:3000`.

## Testing
- Open `http://localhost:3000` in your browser.
- Vite is configured to proxy `/api` requests to the Flask backend on port 8080.
- Changes to frontend files will trigger Hot Module Replacement (HMR).
- Changes to backend files will require a restart of the Flask server (or you can use `flask run --debug`).

## Troubleshooting
- If `npm` fails on Windows due to execution policies, try running it via `cmd /c npm install`.
- Ensure your `.env` file is in the root directory.
