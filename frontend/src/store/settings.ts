import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsStore {
  vanName: string;
  setVanName: (v: string) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      vanName: "Twitch",
      setVanName: (vanName) => set({ vanName }),
    }),
    { name: "van-settings" },
  ),
);
