"use client";

/**
 * LiveHub socket client — connects to the LiveHub Durable Object
 * (home-visit safety tracking) on the same origin at /rt/livehub.
 */
import { io, type Socket } from "@/lib/realtime/client";

export const LIVEHUB_URL = process.env.NEXT_PUBLIC_LIVEHUB_URL || "/rt/livehub";

let socket: Socket | null = null;

export function getLiveSocket(): Socket {
  if (!socket) {
    socket = io(LIVEHUB_URL, {
      transports: ["websocket", "polling"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 1200,
      timeout: 10000,
    });
  }
  return socket;
}

export interface LiveState {
  sessionId: string;
  stage: "scheduled" | "enroute" | "arrived" | "in_progress" | "done";
  progress: number;
  marker: { lat: number; lng: number };
  dest: { lat: number; lng: number };
  destArea: string;
  etaMinutes: number;
  battery: number;
  sosActive: boolean;
  alerts: { type: string; severity: string; message: string; at: string }[];
  checkedInAt?: number;
  checkedOutAt?: number;
  sessionElapsedSec: number;
  lastPingAt?: number;
  silentCheck?: { status: "ok" | "not_ok"; at: number };
  tutorName: string;
  studentName: string;
  subject: string;
  title: string;
  summary?: { topics: string[]; homework: string; notes: string };
  startedAt?: number;
  otp?: string;
  otpExpiresAt?: number;
}
