import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "status-pending": "#d97706",
        "status-approved": "#16a34a",
        "status-rejected": "#dc2626",
        "status-changes-requested": "#2563eb",
      },
    },
  },
  plugins: [],
};

export default config;
