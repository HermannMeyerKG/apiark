import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VariableInput } from "@/components/request/variable-input";
import type { VariableSourceInfo } from "@/stores/environment-store";

const suggestions: VariableSourceInfo[] = [
  { name: "baseUrl", source: "global", value: "https://global.example.com" },
  { name: "bearerToken", source: "collection", value: "abc", environmentName: "development" },
  { name: "other", source: "runtime", value: "runtime" },
];

function focusAtEnd(input: HTMLInputElement) {
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  fireEvent.focus(input);
  fireEvent.keyUp(input);
}

describe("VariableInput", () => {
  it("shows matching variable suggestions inside double curly braces", () => {
    render(
      <VariableInput
        value="{{ba"
        onChange={vi.fn()}
        suggestions={suggestions}
      />,
    );

    focusAtEnd(screen.getByRole("textbox"));

    expect(screen.getByText("baseUrl")).toBeInTheDocument();
    expect(screen.getByText("Global")).toBeInTheDocument();
    expect(screen.queryByText("other")).not.toBeInTheDocument();
  });

  it("inserts the selected variable token", () => {
    const onChange = vi.fn();
    render(
      <VariableInput
        value="url={{ba"
        onChange={onChange}
        suggestions={suggestions}
      />,
    );

    focusAtEnd(screen.getByRole("textbox"));
    fireEvent.mouseDown(screen.getByText("baseUrl"));

    expect(onChange).toHaveBeenCalledWith("url={{baseUrl}}");
  });

  it("does not show suggestions outside variable syntax", () => {
    render(
      <VariableInput
        value="ba"
        onChange={vi.fn()}
        suggestions={suggestions}
      />,
    );

    focusAtEnd(screen.getByRole("textbox"));

    expect(screen.queryByText("baseUrl")).not.toBeInTheDocument();
  });
});
