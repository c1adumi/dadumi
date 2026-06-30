import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FloatingMenu from "../FloatingMenu";
import { SettingsProvider } from "../../context/SettingsContext";

vi.mock("../../utils/tauriBridge", () => ({
  isTauri: () => false,
  invokeCmd: vi.fn().mockResolvedValue(true),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const validSettings = JSON.stringify({
  activeProvider: "bedrock",
  systemPrompts: { en: "", ko: "" },
  language: "en",
  theme: "dark",
  insertShortcutKey: "Enter",
  autoTrigger: false,
  providers: { bedrock: { providerId: "bedrock", model: "us.anthropic.claude-sonnet-4-6", config: { apiKey: "test-key" } } },
});

function renderFloatingMenu(props: Partial<Parameters<typeof FloatingMenu>[0]> = {}) {
  const defaultProps = {
    selectionText: "Test selection text",
    onHide: vi.fn(),
    initialPreset: "professional" as const,
    onPresetChange: vi.fn(),
  };

  return render(
    <SettingsProvider>
      <FloatingMenu {...defaultProps} {...props} />
    </SettingsProvider>
  );
}

describe("FloatingMenu", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          output: { message: { content: [{ text: "AI generated response" }] } },
        }),
        { status: 200 }
      )
    );
  });

  describe("preset buttons", () => {
    it("renders all 5 preset buttons", () => {
      renderFloatingMenu();

      expect(screen.getByText("Fix Grammar")).toBeInTheDocument();
      expect(screen.getByText("Improve Writing")).toBeInTheDocument();
      expect(screen.getByText("Professional Tone")).toBeInTheDocument();
      expect(screen.getByText("Continue Writing")).toBeInTheDocument();
      expect(screen.getByText("Translate to Korean")).toBeInTheDocument();
    });

    it("preset buttons are disabled when no selection text", () => {
      renderFloatingMenu({ selectionText: "" });

      const grammarBtn = screen.getByText("Fix Grammar").closest("button");
      expect(grammarBtn).toBeDisabled();
    });

    it("clicking preset triggers AI query", async () => {
      const user = userEvent.setup();
      const onPresetChange = vi.fn();
      localStorage.setItem("dadumi_settings", validSettings);
      renderFloatingMenu({ onPresetChange });

      await user.click(screen.getByText("Fix Grammar"));

      expect(onPresetChange).toHaveBeenCalledWith("grammar");
      expect(mockFetch).toHaveBeenCalled();
    });

    it("shows focused state on initial preset", () => {
      renderFloatingMenu({ initialPreset: "grammar" });

      const grammarBtn = screen.getByText("Fix Grammar").closest("button");
      expect(grammarBtn).toHaveClass("focused");
    });
  });

  describe("custom prompt input", () => {
    it("renders custom input field", () => {
      renderFloatingMenu();

      expect(screen.getByPlaceholderText("Custom instruction...")).toBeInTheDocument();
    });

    it("custom input is disabled when no selection text", () => {
      renderFloatingMenu({ selectionText: "" });

      const input = screen.getByPlaceholderText("Custom instruction...");
      expect(input).toBeDisabled();
    });

    it("pressing Enter with custom prompt triggers AI query", async () => {
      const user = userEvent.setup();
      localStorage.setItem("dadumi_settings", validSettings);
      renderFloatingMenu();

      const input = screen.getByPlaceholderText("Custom instruction...");
      await user.type(input, "Make it shorter{Enter}");

      expect(mockFetch).toHaveBeenCalled();
    });

    it("send button is disabled when custom prompt is empty", () => {
      localStorage.setItem("dadumi_settings", validSettings);
      renderFloatingMenu();

      const customContainer = document.querySelector(".custom-prompt-container")!;
      const sendBtn = customContainer.querySelector("button");
      expect(sendBtn).toBeDisabled();
    });
  });

  describe("keyboard navigation", () => {
    it("ArrowDown moves focus to next preset", async () => {
      const user = userEvent.setup();
      localStorage.setItem("dadumi_settings", validSettings);
      renderFloatingMenu({ initialPreset: "grammar" });

      await user.keyboard("{ArrowDown}");

      await waitFor(() => {
        const improveBtn = screen.getByText("Improve Writing").closest("button");
        expect(improveBtn).toHaveClass("focused");
      });
    });

    it("Enter triggers focused preset", async () => {
      const user = userEvent.setup();
      const onPresetChange = vi.fn();
      localStorage.setItem("dadumi_settings", validSettings);
      renderFloatingMenu({ initialPreset: "grammar", onPresetChange });

      await user.keyboard("{Enter}");

      expect(onPresetChange).toHaveBeenCalledWith("grammar");
    });
  });

  describe("AI generation flow", () => {
    it("shows AI Output section when generating", async () => {
      const user = userEvent.setup();
      localStorage.setItem("dadumi_settings", validSettings);
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(new Response("{}")), 100))
      );
      renderFloatingMenu();

      await user.click(screen.getByText("Fix Grammar"));

      expect(screen.getByText("AI Output")).toBeInTheDocument();
    });

    it("shows GEN badge while generating", async () => {
      const user = userEvent.setup();
      localStorage.setItem("dadumi_settings", validSettings);
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(new Response("{}")), 100))
      );
      renderFloatingMenu();

      await user.click(screen.getByText("Fix Grammar"));

      expect(screen.getByText("GEN")).toBeInTheDocument();
    });

    it("shows Stop button while generating", async () => {
      const user = userEvent.setup();
      localStorage.setItem("dadumi_settings", validSettings);
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(new Response("{}")), 100))
      );
      renderFloatingMenu();

      await user.click(screen.getByText("Fix Grammar"));

      expect(screen.getByText("Stop")).toBeInTheDocument();
    });

    it("shows API key error when key is missing", async () => {
      const user = userEvent.setup();
      localStorage.setItem(
        "dadumi_settings",
        JSON.stringify({
          activeProvider: "openai",
          systemPrompts: { en: "", ko: "" },
          language: "en",
          theme: "dark",
          insertShortcutKey: "Enter",
          autoTrigger: false,
          providers: { openai: { providerId: "openai", model: "gpt-4o", config: {} } },
        })
      );
      renderFloatingMenu();

      await user.click(screen.getByText("Fix Grammar"));

      await waitFor(() => {
        expect(screen.getByText(/API Key/)).toBeInTheDocument();
      });
    });
  });

  describe("footer actions", () => {
    it("renders settings button", () => {
      renderFloatingMenu();

      const settingsBtn = screen.getAllByRole("button").find((btn) =>
        btn.querySelector("svg circle[cx='12'][cy='12'][r='3']")
      );
      expect(settingsBtn).toBeInTheDocument();
    });

    it("Copy button is disabled when no streamed text", () => {
      renderFloatingMenu();

      const copyBtn = screen.getByText("Copy").closest("button");
      expect(copyBtn).toBeDisabled();
    });

    it("Insert button is enabled when there is selection text", () => {
      renderFloatingMenu();

      const insertBtnText = screen.getByText("Insert");
      const insertBtn = insertBtnText.closest("button");
      expect(insertBtn).not.toBeDisabled();
    });

    it("Insert button is disabled when there is an error", async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Error" } }), { status: 400 })
      );
      localStorage.setItem("dadumi_settings", validSettings);
      renderFloatingMenu();

      await user.click(screen.getByText("Fix Grammar"));

      await waitFor(() => {
        const insertBtnText = screen.getByText("Insert");
        const insertBtn = insertBtnText.closest("button");
        expect(insertBtn).toBeDisabled();
      });
    });
  });

  describe("drag handle", () => {
    it("renders drag handle element", () => {
      renderFloatingMenu();

      const container = document.querySelector(".glass-container");
      expect(container).toBeInTheDocument();
      expect(document.querySelector(".drag-handle")).toBeInTheDocument();
    });
  });

  describe("processing state styling", () => {
    it("shows GEN badge while generating", async () => {
      const user = userEvent.setup();
      let resolvePromise: (value: Response) => void;
      mockFetch.mockImplementation(
        () => new Promise((resolve) => { resolvePromise = resolve; })
      );
      localStorage.setItem("dadumi_settings", validSettings);
      renderFloatingMenu();

      await user.click(screen.getByText("Fix Grammar"));

      await waitFor(() => {
        expect(screen.getByText("GEN")).toBeInTheDocument();
      });

      resolvePromise!(new Response(JSON.stringify({ output: { message: { content: [{ text: "done" }] } } })));
    });
  });
});
