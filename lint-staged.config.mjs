import path from "node:path";

// ESLint configs live in each app, so lint each app's staged files from that app's directory.
const lintApp = (app) => (files) => {
  const root = path.resolve(app);
  const rel = files.map((file) => path.relative(root, file));
  return `pnpm --dir ${app} exec eslint --fix --max-warnings 0 ${rel.map((f) => JSON.stringify(f)).join(" ")}`;
};

export default {
  "apps/portal/**/*.{ts,tsx}": lintApp("apps/portal"),
  "apps/web/**/*.{ts,tsx,js,jsx}": lintApp("apps/web"),
  "*.{json,md,yml,yaml}": (files) => {
    const targets = files.filter((file) => !file.endsWith("pnpm-lock.yaml"));
    return targets.length ? `prettier --write ${targets.map((f) => JSON.stringify(f)).join(" ")}` : [];
  },
};
