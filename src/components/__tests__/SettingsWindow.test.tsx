import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsWindow from "../SettingsWindow";
import { SettingsProvider } from "../../context/SettingsContext";

vi.mock("../../utils/tauriBridge", () => ({
  isTauri: () => false,
  invokeCmd: vi.fn().mockResolvedValue(true),
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

function renderSettingsWindow() {
  return render(
    <SettingsProvider>
      <SettingsWindow />
    </SettingsProvider>
  );
}

describe("SettingsWindow", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("header", () => {
    it("renders Settings title", () => {
      renderSettingsWindow();
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });
  });

  describe("language selection", () => {
    it("renders language toggle buttons", () => {
      renderSettingsWindow();

      expect(screen.getByText("English")).toBeInTheDocument();
      expect(screen.getByText("한국어")).toBeInTheDocument();
    });

    it("English is selected by default", () => {
      renderSettingsWindow();

      const englishBtn = screen.getByText("English").closest("button");
      expect(englishBtn).toHaveClass("active");
    });

    it("clicking Korean changes language", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByText("한국어"));

      const koreanBtn = screen.getByText("한국어").closest("button");
      expect(koreanBtn).toHaveClass("active");
    });

    it("changing language updates UI text", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByText("한국어"));

      expect(screen.getByText("확인")).toBeInTheDocument();
    });
  });

  describe("theme selection", () => {
    it("renders Dark and Light theme options", () => {
      renderSettingsWindow();

      expect(screen.getByText("Dark")).toBeInTheDocument();
      expect(screen.getByText("Light")).toBeInTheDocument();
    });

    it("Dark is selected by default", () => {
      renderSettingsWindow();

      const darkBtn = screen.getByText("Dark").closest("button");
      expect(darkBtn).toHaveClass("active");
    });

    it("clicking Light changes theme", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByText("Light"));

      const lightBtn = screen.getByText("Light").closest("button");
      expect(lightBtn).toHaveClass("active");
    });
  });

  describe("insert shortcut", () => {
    it("renders shortcut input with default Enter", () => {
      renderSettingsWindow();

      const input = screen.getByDisplayValue("Enter");
      expect(input).toBeInTheDocument();
    });

    it("shows modifier label based on platform", () => {
      renderSettingsWindow();

      const hasModifier =
        screen.queryByText("⌘ Cmd") || screen.queryByText("Ctrl");
      expect(hasModifier).toBeInTheDocument();
    });

    it("pressing a key updates shortcut", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      const input = screen.getByDisplayValue("Enter");
      await user.click(input);
      await user.keyboard("j");

      expect(screen.getByDisplayValue("j")).toBeInTheDocument();
    });

    it("pressing Backspace resets to Enter", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      const input = screen.getByDisplayValue("Enter");
      await user.click(input);
      await user.keyboard("j");
      await user.keyboard("{Backspace}");

      expect(screen.getByDisplayValue("Enter")).toBeInTheDocument();
    });

    it("pressing Space sets shortcut to Space", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      const input = screen.getByDisplayValue("Enter");
      await user.click(input);
      await user.keyboard(" ");

      expect(screen.getByDisplayValue("Space")).toBeInTheDocument();
    });
  });

  describe("trigger mode", () => {
    it("renders Manual and Auto options", () => {
      renderSettingsWindow();

      expect(screen.getByText("Manual")).toBeInTheDocument();
      expect(screen.getByText("Auto")).toBeInTheDocument();
    });

    it("Manual is selected by default", () => {
      renderSettingsWindow();

      const manualBtn = screen.getByText("Manual").closest("button");
      expect(manualBtn).toHaveClass("active");
    });

    it("clicking Auto enables auto trigger", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByText("Auto"));

      const autoBtn = screen.getByText("Auto").closest("button");
      expect(autoBtn).toHaveClass("active");
    });
  });

  describe("provider selection", () => {
    it("renders all provider tabs", () => {
      renderSettingsWindow();

      expect(screen.getByRole("button", { name: "OpenAI" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Anthropic" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Google Gemini" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "AWS Bedrock" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "OpenRouter" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "GitHub Copilot" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Custom/ })).toBeInTheDocument();
    });

    it("AWS Bedrock is selected by default", () => {
      renderSettingsWindow();

      const bedrockBtn = screen.getByRole("button", { name: "AWS Bedrock" });
      expect(bedrockBtn).toHaveClass("active");
    });

    it("clicking provider changes selection", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByRole("button", { name: "OpenAI" }));

      const openaiBtn = screen.getByRole("button", { name: "OpenAI" });
      expect(openaiBtn).toHaveClass("active");
    });

    it("changing provider shows relevant fields", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByRole("button", { name: /Custom/ }));

      expect(screen.getByPlaceholderText("http://localhost:11434/v1")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("llama3.2, mistral, etc.")).toBeInTheDocument();
    });
  });

  describe("model selection", () => {
    it("renders model dropdown", () => {
      renderSettingsWindow();

      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();
    });

    it("shows models for active provider", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByRole("button", { name: "OpenAI" }));

      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();
    });

    it("renders refresh button for providers with fetchModels", () => {
      renderSettingsWindow();

      const refreshBtns = screen.getAllByRole("button").filter((btn) =>
        btn.querySelector("svg path[d*='M21 12a9']")
      );
      expect(refreshBtns.length).toBeGreaterThan(0);
    });
  });

  describe("API key input", () => {
    it("renders API key input for providers that need it", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByRole("button", { name: "OpenAI" }));

      const apiKeyInput = screen.getByPlaceholderText("sk-...");
      expect(apiKeyInput).toBeInTheDocument();
      expect(apiKeyInput).toHaveAttribute("type", "password");
    });

    it("typing in API key updates value", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByRole("button", { name: "OpenAI" }));
      const apiKeyInput = screen.getByPlaceholderText("sk-...");

      await user.type(apiKeyInput, "sk-test-key");

      expect(apiKeyInput).toHaveValue("sk-test-key");
    });
  });

  describe("GitHub Copilot auth", () => {
    it("shows Login button for GitHub Copilot", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByRole("button", { name: "GitHub Copilot" }));

      expect(screen.getByText("Login with GitHub")).toBeInTheDocument();
    });

    it("hides API key field for GitHub Copilot", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByRole("button", { name: "GitHub Copilot" }));

      expect(screen.queryByPlaceholderText("Managed by OAuth login")).not.toBeInTheDocument();
    });
  });

  describe("system prompt", () => {
    it("renders system prompt textarea", () => {
      renderSettingsWindow();

      const textarea = screen.getByPlaceholderText(/You are a helpful writing assistant/);
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe("TEXTAREA");
    });

    it("shows language indicator", () => {
      renderSettingsWindow();

      expect(screen.getByText(/System Instructions/)).toBeInTheDocument();
      expect(screen.getByText(/\(EN\)/)).toBeInTheDocument();
    });

    it("changing language changes indicator", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByText("한국어"));

      expect(screen.getByText(/시스템 지침/)).toBeInTheDocument();
      expect(screen.getByText(/\(KO\)/)).toBeInTheDocument();
    });
  });

  describe("confirm button", () => {
    it("renders Confirm button", () => {
      renderSettingsWindow();

      expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    });

    it("clicking Confirm saves settings", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByText("Light"));
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      const saved = JSON.parse(localStorage.getItem("dadumi_settings")!);
      expect(saved.theme).toBe("light");
    });
  });

  describe("custom provider fields", () => {
    it("shows all custom provider fields", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByRole("button", { name: /Custom/ }));

      expect(screen.getByPlaceholderText("http://localhost:11434/v1")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Leave blank if not required")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("llama3.2, mistral, etc.")).toBeInTheDocument();
    });

    it("typing in custom fields updates values", async () => {
      const user = userEvent.setup();
      renderSettingsWindow();

      await user.click(screen.getByRole("button", { name: /Custom/ }));
      const baseUrlInput = screen.getByPlaceholderText("http://localhost:11434/v1");

      await user.type(baseUrlInput, "http://my-server:8080/v1");

      expect(baseUrlInput).toHaveValue("http://my-server:8080/v1");
    });
  });
});
