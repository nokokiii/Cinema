/**
 * ============================================================================
 * Jest configuration for Cinema reservation system
 * ============================================================================
 * Obsługuje dwa projekty:
 *   - unit:        testy jednostkowe logiki biznesowej (in-memory, szybkie)
 *   - integration: testy API (wymagają działającego serwera Next.js)
 * ============================================================================
 */

import type { Config } from "jest";

const config: Config = {
  // Domyślnie uruchamia tylko testy jednostkowe (szybkie, bez serwera)
  // Użyj --selectProjects integration aby uruchomić testy API
  projects: [
    // ------------------------------------------------------------------
    // Projekt 1: Unit tests – logika biznesowa
    // ------------------------------------------------------------------
    {
      displayName: "unit",
      testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
      preset: "ts-jest",
      testEnvironment: "node",
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
      },
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: {
              // Luźniejsze opcje dla środowiska testowego
              module: "commonjs",
              esModuleInterop: true,
              allowSyntheticDefaultImports: true,
              moduleResolution: "node",
              strict: true,
              target: "ES2017",
            },
          },
        ],
      },
      // Izolacja in-memory store między plikami testów
      clearMocks: true,
      resetModules: false,
    },

    // ------------------------------------------------------------------
    // Projekt 2: Integration tests – HTTP API
    // ------------------------------------------------------------------
    {
      displayName: "integration",
      testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
      preset: "ts-jest",
      testEnvironment: "node",
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
      },
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: {
              module: "commonjs",
              esModuleInterop: true,
              allowSyntheticDefaultImports: true,
              moduleResolution: "node",
              strict: true,
              target: "ES2017",
            },
          },
        ],
      },
      // Integracyjne testy mogą być wolniejsze – wydłużony timeout
      testTimeout: 30000,
    },
  ],

  // Globalne ustawienia raportowania
  verbose: true,
  collectCoverageFrom: [
    "app/lib/**/*.ts",
    "app/api/**/*.ts",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
};

export default config;
