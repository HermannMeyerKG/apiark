import { describe, expect, it } from "vitest";
import {
  getArkEnvGetCompletionContext,
  getArkEnvMemberCompletionContext,
} from "@/components/ui/env-completions";

describe("getArkEnvMemberCompletionContext", () => {
  it("detects ark.env member access after the dot", () => {
    const context = getArkEnvMemberCompletionContext("ark.env.");

    expect(context).toMatchObject({
      typedPrefix: "",
    });
  });

  it("detects partially typed ark.env members", () => {
    const context = getArkEnvMemberCompletionContext("ark.env.g");

    expect(context).toMatchObject({
      typedPrefix: "g",
    });
  });

  it("does not match other ark properties", () => {
    expect(getArkEnvMemberCompletionContext("ark.request.")).toBeNull();
  });
});

describe("getArkEnvGetCompletionContext", () => {
  it("detects double-quoted ark.env.get arguments", () => {
    const context = getArkEnvGetCompletionContext('const token = ark.env.get("to');

    expect(context).toMatchObject({
      typedPrefix: "to",
      wrapInQuotes: false,
    });
  });

  it("detects single-quoted ark.env.get arguments", () => {
    const context = getArkEnvGetCompletionContext("const token = ark.env.get('to");

    expect(context).toMatchObject({
      typedPrefix: "to",
      wrapInQuotes: false,
    });
  });

  it("detects unquoted ark.env.get arguments", () => {
    const context = getArkEnvGetCompletionContext("const token = ark.env.get(to");

    expect(context).toMatchObject({
      typedPrefix: "to",
      wrapInQuotes: true,
    });
  });

  it("suggests quoted insert text when the argument is empty and unquoted", () => {
    const context = getArkEnvGetCompletionContext("const token = ark.env.get(");

    expect(context).toMatchObject({
      typedPrefix: "",
      wrapInQuotes: true,
    });
  });

  it("does not match outside ark.env.get", () => {
    expect(getArkEnvGetCompletionContext('const token = env.get("to')).toBeNull();
    expect(getArkEnvGetCompletionContext('ark.env.set("to')).toBeNull();
  });

  it("detects persistent environment mutation arguments", () => {
    expect(getArkEnvGetCompletionContext('ark.env.persist("to')).toMatchObject({
      typedPrefix: "to",
      wrapInQuotes: false,
    });
    expect(getArkEnvGetCompletionContext('ark.env.persistUnset("to')).toMatchObject({
      typedPrefix: "to",
      wrapInQuotes: false,
    });
  });
});
