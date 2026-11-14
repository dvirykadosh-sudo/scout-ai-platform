// שלב 66 (ממצא 76): בדיקת קוד לשרת. מתמקדת בבאגים אמיתיים (משתנה שלא הוגדר, קוד שלא מגיעים אליו, מפתח כפול),
// ואילו סגנון (אזהרות) לא עוצר כלום. הרצה מהשורש: npm run lint:setup ואז npm run lint
import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node } },
    rules: {
      "no-undef": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-redeclare": "error",
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // תווים מיוחדים מכוונים (רווחים עבריים, ביטויים רגולריים של טקסט חופשי)
      "no-irregular-whitespace": "off",
      "no-useless-escape": "off",
      "no-control-regex": "off",
      "no-misleading-character-class": "off",
      "no-prototype-builtins": "off",
      "no-inner-declarations": "off",
    },
  },
];
