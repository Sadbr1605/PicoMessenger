# PicoMessenger Project

A lightweight, microcontroller-friendly messaging system. It connects a Raspberry Pi Pico W (MicroPython) to a Web PWA using Firebase Cloud Functions and Firestore.

## Architecture

1.  **Backend:** Firebase Cloud Functions (Node.js/Express) providing a REST API.
2.  **Database:** Firestore (stores devices, threads, messages).
3.  **Frontend:** React PWA (Vite) hosted on Vercel/Firebase Hosting.
4.  **Client:** Raspberry Pi Pico W (MicroPython) - *Code not included in this repo, but API is designed for it.*

## Prerequisites

*   Node.js 18+
*   Firebase CLI (`npm install -g firebase-tools`)
*   A Firebase Project created in the [Firebase Console](https://console.firebase.google.com/) (Blaze plan required for Cloud Functions external network access, though strictly internal Firestore access might work on Spark, Blaze is recommended).

## 1. Backend Setup

1.  Navigate to `backend`:
    ```bash
    cd backend
    npm install
    ```
2.  Login to Firebase:
    ```bash
    firebase login
    ```
3.  Initialize project (if not already linked):
    ```bash
    firebase use --add
    # Select your project ID
    ```
4.  Deploy:
    ```bash
    npm run deploy
    ```
    *Note the URL output (e.g., `https://us-central1-YOURID.cloudfunctions.net/api`). You need this.*

### Local Development (Emulators)
To test without deploying:
```bash
npm run serve
```
API will run at `http://localhost:5001/...`

## 2. Frontend Setup

1.  Navigate to `frontend`:
    ```bash
    cd frontend
    npm install
    ```
2.  Create `.env` file (or rename `.env.example` if it existed):
    ```env
    VITE_API_URL=https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net/api
    ```
    *Replace with your actual deployed function URL.*

3.  Run locally:
    ```bash
    npm run dev
    ```

4.  Deploy to Vercel:
    *   Push repo to GitHub.
    *   Import into Vercel.
    *   Add Environment Variable `VITE_API_URL` in Vercel settings.

## 3. MicroPython (Pico W) Implementation Guide

The Pico W should implement the following logic:

1.  **Boot:** Connect to Wi-Fi.
2.  **Check Config:** Do I have a saved `token` and `thread_id`?
    *   **No:** POST `/register`. Save received `token`, `thread_id`, `pair_code`. Display `thread_id` and `pair_code` on OLED.
    *   **Yes:** Proceed.
3.  **Loop:**
    *   GET `/pull?after={last_msg_id}` with Header `Authorization: Bearer {token}`.
    *   If messages received, display them on OLED and update `last_msg_id`.
    *   Sleep `poll_interval_ms` (from register response, default 2s).
4.  **On Button Press:**
    *   POST `/send` with JSON `{ "text": "Hello" }` and Header `Authorization: Bearer {token}`.

## API Reference

See `openapi.yaml` for full details.

### Security Notes
*   The `web_send` and `web_pull` endpoints rely on the 6-digit `pair_code`. This is "shared secret" security suitable for a hobbyist project. For production, consider implementing true user auth on the frontend and linking it to the device.
*   The API enforces small payloads to prevent memory errors on the Pico W.
