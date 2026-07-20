/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scanner reads every class token from these files.
  // JS files are included because site-render.js and other scripts
  // emit HTML strings with utility classes at runtime.
  content: [
    './html/**/*.html',
    './html/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', 'sans-serif'],
      },
    },
  },
  plugins: [],
  // NOTE: All arbitrary-value utilities used in the site (e.g. bg-[#1a237e],
  // object-[18%_12%], scale-[1.09]) are already picked up by the content glob
  // scanner from HTML/JS files, so no explicit safelist is required.
  // If a class is only ever composed dynamically (e.g. class name assembled
  // from a variable at runtime), add it as a full string here.
  safelist: [],
};
