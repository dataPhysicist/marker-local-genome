import { create } from "zustand";
import type {
  AnalyzeResult,
  EnrichmentRecord,
  VariantRow,
} from "../lib/types";
import type { QcReport } from "../lib/types";

export type Phase = "idle" | "analyzing" | "report";

type AppState = {
  phase: Phase;
  progressPct: number;
  progressLabel: string;
  error?: string;
  qc: QcReport | null;
  variants: Record<string, VariantRow> | null;
  analysis: AnalyzeResult | null;
  enrichment: Record<string, EnrichmentRecord> | null;
  enrichStatus: string | null;
  enrichBusy: boolean;
  dark: boolean;
  paletteOpen: boolean;
  drawerFindingId: string | null;
};

type AppActions = {
  reset: () => void;
  startAnalyze: () => void;
  analyzeSuccess: (qc: QcReport, variants: Record<string, VariantRow>, analysis: AnalyzeResult) => void;
  analyzeFail: (message: string) => void;
  setProgress: (pct: number, label: string) => void;
  setEnrichment: (
    rec: Record<string, EnrichmentRecord> | null,
    status: string | null,
  ) => void;
  setEnrichBusy: (busy: boolean) => void;
  toggleDark: () => void;
  setPaletteOpen: (open: boolean) => void;
  openDrawer: (id: string | null) => void;
};

const persistedDark = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("ga-dark") === "1";
};

export const useAppStore = create<AppState & AppActions>((set) => ({
  phase: "idle",
  progressPct: 0,
  progressLabel: "",
  qc: null,
  variants: null,
  analysis: null,
  enrichment: null,
  enrichStatus: null,
  enrichBusy: false,
  dark: persistedDark(),
  paletteOpen: false,
  drawerFindingId: null,

  reset: () =>
    set({
      phase: "idle",
      progressPct: 0,
      progressLabel: "",
      error: undefined,
      qc: null,
      variants: null,
      analysis: null,
      enrichment: null,
      enrichStatus: null,
      enrichBusy: false,
      drawerFindingId: null,
    }),

  startAnalyze: () =>
    set({ phase: "analyzing", progressPct: 5, progressLabel: "Reading file…", error: undefined }),

  analyzeSuccess: (qc, variants, analysis) =>
    set({
      phase: "report",
      qc,
      variants,
      analysis,
      progressPct: 100,
      progressLabel: "Done",
    }),

  analyzeFail: (message) =>
    set({ phase: "idle", error: message, progressPct: 0, progressLabel: "" }),

  setProgress: (pct, label) => set({ progressPct: pct, progressLabel: label }),

  setEnrichment: (rec, status) => set({ enrichment: rec, enrichStatus: status }),

  setEnrichBusy: (busy) => set({ enrichBusy: busy }),

  toggleDark: () =>
    set((state) => {
      const dark = !state.dark;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("ga-dark", dark ? "1" : "0");
        document.documentElement.classList.toggle("dark", dark);
      }
      return { dark };
    }),

  setPaletteOpen: (open) => set({ paletteOpen: open }),

  openDrawer: (id) => set({ drawerFindingId: id }),
}));
