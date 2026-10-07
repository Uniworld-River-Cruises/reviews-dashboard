import { DEFAULT_CLASSIFIER_MODEL, classifierRequestParams, extractResponseText, getClassifierModel } from "../model";

describe("Classifier model settings", () => {
  const original = process.env.CLASSIFIER_MODEL;
  afterEach(() => {
    if (original === undefined) delete process.env.CLASSIFIER_MODEL;
    else process.env.CLASSIFIER_MODEL = original;
  });

  it("defaults to Haiku 5.5", () => {
    delete process.env.CLASSIFIER_MODEL;
    expect(getClassifierModel()).toBe("claude-haiku-5-5");
    expect(DEFAULT_CLASSIFIER_MODEL).toBe("claude-haiku-5-5");
  });

  it("honors the CLASSIFIER_MODEL override", () => {
    process.env.CLASSIFIER_MODEL = "claude-haiku-4-5";
    expect(getClassifierModel()).toBe("claude-haiku-4-5");
  });

  it("sends low effort to Haiku 5.5 and omits it for Haiku 4.5", () => {
    expect(classifierRequestParams("claude-haiku-5-5")).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 2048,
      output_config: { effort: "low" },
    });
    expect(classifierRequestParams("claude-haiku-4-5-20251001")).toEqual({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
    });
  });
});

describe("extractResponseText", () => {
  it("skips leading thinking blocks", () => {
    const content = [
      { type: "thinking", thinking: "", signature: "abc" },
      { type: "text", text: '{"positive": [], "negative": []}' },
    ];
    expect(extractResponseText(content)).toBe('{"positive": [], "negative": []}');
  });

  it("returns an empty string when there is no text block", () => {
    expect(extractResponseText([{ type: "thinking" }])).toBe("");
  });
});
