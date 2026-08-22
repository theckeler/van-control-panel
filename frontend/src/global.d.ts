declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
