declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_DEMO?: string;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
