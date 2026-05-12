# Agent Instructions: Development & Testing Guidelines

Welcome, AI Agent! This guide outlines the project structure, development workflow, and coding standards for the **YIN Wordle PWA** repository. Please read this document carefully before making any code modifications or introducing new features.

---

## 🚨 Core Directive: Test-First Development & Unit Testing

We maintain a high standard of code correctness and reliability. You **MUST** adhere to the following rules:

1. **Write Unit Tests Where Possible:** Every bug fix, helper function, algorithm adjustment, and feature addition **MUST** be accompanied by comprehensive unit tests.
2. **Prioritize Unit Tests (`Vitest`):** Pure logical elements, state machines, scoring algorithms, and API wrappers should be tested in isolation using Vitest inside the `tests/unit/` directory.
3. **Use End-to-End Tests (`Playwright`):** DOM interactions, UI layout responsiveness, animations, ad gateway workflows, and network-offline/online state transitions should be tested in `tests/e2e/`.
4. **Run Tests Before Declaring Success:** Never consider a task done until you have run the test suite and confirmed that all tests (both old and new) pass cleanly.

---

## 🏗️ Repository Architecture

The project is structured as follows:

```text
yin_customloyalty_wordle/
├── src/                          # TypeScript source files (EDIT THESE!)
│   ├── app.ts                    # UI controller, DOM manipulation, event listeners, keyboard
│   └── mockApi.ts                # Wordle game engine, dictionary, scoring, state management, ad-gateway
├── pwa_mvp/                      # Distribution folder (DO NOT EDIT MANUALLY!)
│   ├── app.js                    # Compiled app logic
│   ├── mockApi.js                # Compiled engine logic
│   ├── index.html                # Application entry HTML
│   ├── style.css                 # Main application CSS
│   ├── manifest.json             # PWA Web Manifest
│   └── sw.js                     # PWA Service Worker
├── tests/                        # Full Test Suite
│   ├── unit/                     # Unit tests
│   │   └── mockApi.test.ts       # Vitest tests for game logic and backend rules
│   └── e2e/                      # End-to-End user interaction tests
│       ├── wordle.spec.ts        # Playwright UI & browser-level tests
│       └── wordle.spec.js        # Playwright UI & browser-level tests (JS variant)
├── package.json                  # Dependencies, metadata, and runner scripts
├── playwright.config.js          # Playwright test suite configuration
├── tsconfig.json                 # TypeScript compiler configuration
└── vitest.config.ts              # Vitest test suite configuration
```

---

## ⚙️ Development & Build Workflow

The source of truth for the logic resides in the `src/` folder. **Do not modify compiled JS files in `pwa_mvp/` directly!**

### 1. Modifying Code
- Edit the TypeScript files under `src/`.
- Ensure type safety and adhere to TypeScript best practices (`strict: true` is enabled).

### 2. Building/Compiling Code
After any code changes in `src/`, compile them into JavaScript for execution in the PWA environment:
```powershell
# Call via CMD if PowerShell script policy blocks execution:
cmd /c "npm run build"
```

### 3. Running Unit Tests
Unit tests are written with **Vitest** and execute inside a happy-dom environment. Make sure to update/add test cases when changing logic in `src/mockApi.ts`.
```powershell
# Run unit tests once:
cmd /c "npm run test:unit"

# Run unit tests in interactive watch mode:
cmd /c "npm run test:unit:watch"
```

### 4. Running E2E Tests
E2E tests use **Playwright** to spin up an ephemeral local server (`http://localhost:8080`) and test interactions directly in standard browser instances.
```powershell
# Run all Playwright tests (headless):
cmd /c "npm run test"

# Run Playwright in Interactive UI mode (great for debugging):
cmd /c "npm run test:ui"
```

---

## 🎨 Layout, Aesthetics & PWA Best Practices

- **Mobile First & Responsive Grid:** The Wordle grid leverages modern container queries and CSS variables to remain perfectly square and auto-scale beautifully on variable screen sizes (e.g., iPhone 12 Pro). Keep these layout rules intact.
- **Micro-Animations & Feedback:** Buttons should have subtle hover/active scales, keys should click responsively, and row shake animations should play on validation failures.
- **Language Localization:** The game is fully localized in **Polish** (`PL`). All interface text, dictionary assets, and toast messages should maintain professional Polish grammar and vocabulary.
- **Ad-Gateway & Gamification State Flow:** The game requires users to complete a brief ad-countdown before claiming points and extending their streak. Ensure that the `WordleMockBackend` status machine flow (`playing` -> `won_pending_ad` / `lost_pending_ad` -> `completed_rewarded`) remains secure and fully validated.

---

## 📑 Summary of Checklist for Agents

Before completing a task, verify the following:
- [ ] Modified code is in `src/` (TypeScript) rather than `pwa_mvp/` (JavaScript).
- [ ] Ran `npm run build` to compile changes.
- [ ] Wrote comprehensive **unit tests** in `tests/unit/` covering edge cases, failure states, and positive scenarios.
- [ ] Ran `npm run test:unit` and confirmed **100% of unit tests pass**.
- [ ] (If UI/layout changed) Ran `npm run test` and confirmed all **E2E tests pass**.
- [ ] Code is fully typed, clean, and follows existing design aesthetics.
