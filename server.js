const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
res.sendFile(path.join(__dirname, "public", "index.html"));
});

const rooms = new Map();

function send(ws, data) {
if (ws.readyState === WebSocket.OPEN) {
ws.send(JSON.stringify(data));
}
}

function broadcast(roomCode, data, except = null) {
const room = rooms.get(roomCode);
if (!room) return;

for (const client of room) {
if (client !== except) send(client, data);
}
}

wss.on("connection", (ws) => {
ws.roomCode = null;

ws.on("message", (raw) => {
let data;

try {
  data = JSON.parse(raw.toString());
} catch {
  send(ws, { type: "error", message: "Dữ liệu không hợp lệ." });
  return;
}

if (data.type === "create") {
  let code;

  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));

  rooms.set(code, new Set([ws]));
  ws.roomCode = code;

  send(ws, {
    type: "created",
    code,
    players: 1
  });

  return;
}

if (data.type === "join") {
  const code = String(data.code || "").trim();
  const room = rooms.get(code);

  if (!room) {
    send(ws, {
      type: "error",
      message: "Không tìm thấy phòng."
    });
    return;
  }

  if (room.size >= 2) {
    send(ws, {
      type: "error",
      message: "Phòng đã đủ 2 người."
    });
    return;
  }

  if (ws.roomCode) {
    const oldRoom = rooms.get(ws.roomCode);
    if (oldRoom) oldRoom.delete(ws);
  }

  room.add(ws);
  ws.roomCode = code;

  send(ws, {
    type: "joined",
    code,
    players: room.size
  });

  broadcast(code, {
    type: "players",
    players: room.size
  });

  return;
}

if (!ws.roomCode) {
  send(ws, {
    type: "error",
    message: "Bạn cần tạo hoặc tham gia phòng trước."
  });
  return;
}

if (data.type === "start") {
  const room = rooms.get(ws.roomCode);

  if (!room || room.size < 2) {
    send(ws, {
      type: "error",
      message: "Cần đủ 2 người để bắt đầu."
    });
    return;
  }

  broadcast(ws.roomCode, {
    type: "start"
  });

  return;
}

if (
  data.type === "state" ||
  data.type === "action"
) {
  broadcast(
    ws.roomCode,
    {
      type: data.type,
      payload: data.payload
    },
    ws
  );
}

});

ws.on("close", () => {
const code = ws.roomCode;
if (!code) return;

const room = rooms.get(code);
if (!room) return;

room.delete(ws);

broadcast(code, {
  type: "players",
  players: room.size
});

broadcast(code, {
  type: "opponent_left"
});

if (room.size === 0) {
  rooms.delete(code);
}

});
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
console.log("Game server running on port ${PORT}");
});
