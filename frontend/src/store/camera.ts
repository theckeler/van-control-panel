import { create } from "zustand";
import { api } from "../api/client";
import type { Photo } from "../types";
import { toast } from "./toast";

const STORAGE_KEY = "van-camera-enabled";

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

// The camera switch and the latest frame, shared by the dashboard's camera
// card, the action row's camera button and the camera drawer. "Enabled" is a
// per-browser preference, not something on the Pi.
interface CameraStore {
  enabled: boolean;
  latest: Photo | null;
  loading: boolean;
  setEnabled: (on: boolean) => void;
  refresh: () => Promise<void>;
  capture: () => Promise<void>;
}

export const useCameraStore = create<CameraStore>((set, get) => ({
  enabled: loadEnabled(),
  latest: null,
  loading: true,

  setEnabled: (on) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(on));
    } catch {
      /* best effort */
    }
    set({ enabled: on, ...(on ? {} : { latest: null }) });
    if (on) void get().refresh();
  },

  refresh: async () => {
    if (!get().enabled) {
      set({ loading: false });
      return;
    }
    set({ loading: true });
    try {
      set({ latest: await api.camera.latest("interior") });
    } catch {
      set({ latest: null });
    } finally {
      set({ loading: false });
    }
  },

  capture: async () => {
    try {
      await api.camera.capture("interior");
      toast.success("Photo taken");
      await get().refresh();
    } catch (err) {
      toast.error(
        `Couldn't take a photo: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
}));
