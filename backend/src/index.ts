import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";
import { randomUUID, randomBytes } from "crypto";

admin.initializeApp();
const db = admin.firestore();

const app = express();

// Middleware: CORS and JSON parsing
app.use(cors({ origin: true }));
app.use(express.json());

// Helper: Standardized short error response
const sendError = (res: express.Response, code: number, error: string, detail?: string) => {
  res.status(code).json({ ok: false, error, detail });
};

// --- ROUTES ---

// 1. REGISTER
// POST /api/register
// Input: { device_id?: string, name?: string }
app.post("/register", async (req, res) => {
  try {
    const { device_id, name } = req.body;
    
    // Generate or use provided IDs
    const finalDeviceId = device_id || randomUUID().substring(0, 8);
    const threadId = device_id ? undefined : randomUUID().substring(0, 8); // Keep existing thread if device exists
    
    // Generate secure token and simple pair code
    const token = randomBytes(16).toString("hex");
    const pairCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits

    const deviceRef = db.collection("devices").doc(finalDeviceId);
    
    let resultThreadId = threadId;

    await db.runTransaction(async (t) => {
      const doc = await t.get(deviceRef);
      const now = admin.firestore.Timestamp.now();

      if (doc.exists) {
        // Idempotency: Update token, keep thread_id
        const data = doc.data();
        resultThreadId = data?.thread_id;
        t.update(deviceRef, {
          token,
          pair_code: pairCode, // Rotate pair code on re-register
          updated_at: now,
          name: name || data?.name
        });
      } else {
        // New Device
        if (!resultThreadId) resultThreadId = randomUUID().substring(0, 8);
        t.set(deviceRef, {
          device_id: finalDeviceId,
          thread_id: resultThreadId,
          token,
          pair_code: pairCode,
          name: name || "Unknown Device",
          created_at: now,
          updated_at: now
        });
        
        // Initialize thread metadata
        t.set(db.collection("threads").doc(resultThreadId!), {
          last_msg_id: 0,
          created_at: now
        });
      }
    });

    res.json({
      thread_id: resultThreadId,
      token,
      poll_interval_ms: 2000,
      pair_code: pairCode // Returned so device can display it
    });

  } catch (e: any) {
    console.error(e);
    sendError(res, 500, "INTERNAL_ERROR", "Registration failed");
  }
});

// Middleware: Verify Bearer Token (For Device)
const verifyDeviceToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, 401, "UNAUTHORIZED", "Missing token");
  }
  const token = authHeader.split("Bearer ")[1];
  
  // In a real app, use a proper index query or cache. 
  // For simplicity/scale limits, we query devices by token.
  const snapshot = await db.collection("devices").where("token", "==", token).limit(1).get();
  
  if (snapshot.empty) {
    return sendError(res, 403, "FORBIDDEN", "Invalid token");
  }

  const deviceData = snapshot.docs[0].data();
  // Attach context to request
  (req as any).deviceCtx = {
    thread_id: deviceData.thread_id,
    device_id: deviceData.device_id
  };
  next();
};

// 2. SEND (Device)
// POST /api/send
// Headers: Authorization: Bearer <token>
// Input: { text: string }
app.post("/send", verifyDeviceToken, async (req, res) => {
  try {
    const { text } = req.body;
    const { thread_id } = (req as any).deviceCtx;

    if (!text || text.length > 280) {
      return sendError(res, 400, "BAD_REQUEST", "Text invalid (1-280 chars)");
    }

    const threadRef = db.collection("threads").doc(thread_id);
    let msgId = 0;
    const ts = Date.now();

    await db.runTransaction(async (t) => {
      const threadDoc = await t.get(threadRef);
      if (!threadDoc.exists) throw new Error("Thread not found");
      
      const currentLastId = threadDoc.data()?.last_msg_id || 0;
      msgId = currentLastId + 1;

      // Update counter
      t.update(threadRef, { last_msg_id: msgId, updated_at: admin.firestore.Timestamp.now() });

      // Save message
      const msgRef = threadRef.collection("messages").doc(msgId.toString());
      t.set(msgRef, {
        msg_id: msgId,
        from: "device",
        text,
        ts
      });
    });

    res.json({ ok: true, msg_id: msgId, server_ts: ts });
  } catch (e) {
    console.error(e);
    sendError(res, 500, "INTERNAL_ERROR", "Send failed");
  }
});

// 3. PULL (Device)
// GET /api/pull?after=number
// Headers: Authorization: Bearer <token>
app.get("/pull", verifyDeviceToken, async (req, res) => {
  try {
    const after = parseInt(req.query.after as string) || 0;
    const { thread_id } = (req as any).deviceCtx;

    const msgsRef = db.collection("threads").doc(thread_id).collection("messages");
    const snapshot = await msgsRef
      .where("msg_id", ">", after)
      .orderBy("msg_id", "asc")
      .limit(3) // Strict limit for microcontroller memory
      .get();

    const msgs = snapshot.docs.map(doc => {
      const d = doc.data();
      return { msg_id: d.msg_id, from: d.from, text: d.text, ts: d.ts };
    });

    const latest = msgs.length > 0 ? msgs[msgs.length - 1].msg_id : after;

    res.json({ msgs, latest });
  } catch (e) {
    console.error(e);
    sendError(res, 500, "INTERNAL_ERROR", "Pull failed");
  }
});

// 4. WEB SEND (Frontend PWA)
// POST /api/web_send
// Input: { thread_id: string, pair_code: string, text: string }
// No Bearer token needed here, we validate pair_code/thread combo.
app.post("/web_send", async (req, res) => {
  try {
    const { thread_id, pair_code, text } = req.body;

    if (!thread_id || !pair_code || !text) return sendError(res, 400, "BAD_REQUEST", "Missing fields");

    // Validate Thread + Pair Code
    const devicesSnap = await db.collection("devices")
      .where("thread_id", "==", thread_id)
      .where("pair_code", "==", pair_code)
      .limit(1)
      .get();

    if (devicesSnap.empty) {
      return sendError(res, 403, "FORBIDDEN", "Invalid credentials");
    }

    const threadRef = db.collection("threads").doc(thread_id);
    let msgId = 0;
    const ts = Date.now();

    await db.runTransaction(async (t) => {
      const threadDoc = await t.get(threadRef);
      if (!threadDoc.exists) throw new Error("Thread missing");

      const currentLastId = threadDoc.data()?.last_msg_id || 0;
      msgId = currentLastId + 1;

      t.update(threadRef, { last_msg_id: msgId, updated_at: admin.firestore.Timestamp.now() });
      
      const msgRef = threadRef.collection("messages").doc(msgId.toString());
      t.set(msgRef, {
        msg_id: msgId,
        from: "web", // Explicitly from web
        text,
        ts
      });
    });

    res.json({ ok: true, msg_id: msgId, ts });
  } catch (e) {
    console.error(e);
    sendError(res, 500, "INTERNAL_ERROR", "Web send failed");
  }
});

// 5. WEB PULL (Frontend PWA)
// GET /api/web_pull?thread_id=...&pair_code=...&after=...
// Allow the web client to poll using pair_code instead of token
app.get("/web_pull", async (req, res) => {
  try {
    const { thread_id, pair_code, after } = req.query;
    const afterNum = parseInt(after as string) || 0;

    if (!thread_id || !pair_code) return sendError(res, 400, "BAD_REQUEST", "Missing auth");

    // Validate credentials
    const devicesSnap = await db.collection("devices")
      .where("thread_id", "==", thread_id)
      .where("pair_code", "==", pair_code)
      .limit(1)
      .get();

    if (devicesSnap.empty) return sendError(res, 403, "FORBIDDEN", "Invalid credentials");

    const msgsRef = db.collection("threads").doc(thread_id as string).collection("messages");
    const snapshot = await msgsRef
      .where("msg_id", ">", afterNum)
      .orderBy("msg_id", "asc")
      .limit(20) // Web can handle more than Pico
      .get();

    const msgs = snapshot.docs.map(doc => {
      const d = doc.data();
      return { msg_id: d.msg_id, from: d.from, text: d.text, ts: d.ts };
    });

    const latest = msgs.length > 0 ? msgs[msgs.length - 1].msg_id : afterNum;

    res.json({ msgs, latest });
  } catch (e) {
    console.error(e);
    sendError(res, 500, "INTERNAL_ERROR", "Web pull failed");
  }
});


// Expose Express app as a single Cloud Function
export const api = functions.https.onRequest(app);
