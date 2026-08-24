import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsStore {
  gap: number; // Dashboard flex gap (2-6)
  spacing: number; // Component internal spacing multiplier (1-3)
  vanName: string;
  setGap: (v: number) => void;
  setSpacing: (v: number) => void;
  setVanName: (v: string) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      gap: 4,
      spacing: 2,
      vanName: "Twitch",
      setGap: (gap) => set({ gap }),
      setSpacing: (spacing) => set({ spacing }),
      setVanName: (vanName) => set({ vanName }),
    }),
    { name: "van-settings" },
  ),
);
