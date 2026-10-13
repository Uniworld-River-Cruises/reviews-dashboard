import { extractMerchantReply, htmlToPlainText } from "../reply";
import { FeefoReview } from "../../feefo/types";

describe("htmlToPlainText", () => {
  it("turns <br>, </p> and </div> into line breaks and strips other tags", () => {
    expect(
      htmlToPlainText(
        "<p>Dear Jane,</p><p>Thank you<br>for sailing<br/>with us.</p><div><b>Uniworld</b></div>"
      )
    ).toBe("Dear Jane,\nThank you\nfor sailing\nwith us.\nUniworld");
  });

  it("keeps link text and drops the markup of mailto links", () => {
    expect(
      htmlToPlainText(
        'Please email <a href="mailto:guestrelations@uniworld.com">guestrelations@uniworld.com</a>.'
      )
    ).toBe("Please email guestrelations@uniworld.com.");
  });

  it("decodes named and numeric entities and turns non-breaking spaces into spaces", () => {
    expect(
      htmlToPlainText("Fish &amp; chips&nbsp;on&#160;board &#39;daily&#x27; &quot;fresh&quot;")
    ).toBe("Fish & chips on board 'daily' \"fresh\"");
  });

  it("collapses runs of blank lines and trims whitespace", () => {
    expect(htmlToPlainText("  <p>One</p>\n\n\n<p></p><p>   Two  </p>  ")).toBe("One\n\nTwo");
  });

  it("leaves plain text untouched", () => {
    const text = "Thank you for your feedback which has been passed on for further review.";
    expect(htmlToPlainText(text)).toBe(text);
  });

  it("never returns a tag for markup in the source", () => {
    const out = htmlToPlainText('<script>alert(1)</script><img src=x onerror="y">Hi');
    expect(out).not.toMatch(/<[a-z/][^>]*>/i);
    expect(out).toBe("alert(1)Hi");
  });
});

function raw(overrides: Partial<FeefoReview> = {}): FeefoReview {
  return {
    merchant: { identifier: "uniworld" },
    url: "https://www.feefo.com/en-US/reviews/uniworld/abc",
    customer: {},
    service: {
      rating: { min: 1, max: 5, rating: 1 },
      id: "svc",
      created_at: "2026-01-01T00:00:00Z",
    },
    products: [
      {
        rating: { min: 1, max: 5, rating: 1 },
        id: "prod",
        product: { title: "Trip", sku: "1-2" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    last_updated_date: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

describe("extractMerchantReply", () => {
  const base = raw();

  it("returns null without a thread or merchant comment", () => {
    expect(extractMerchantReply(base)).toBeNull();
    expect(
      extractMerchantReply(
        raw({
          service: {
            ...base.service!,
            thread: [
              { type: "CUSTOMER_RETITLE", author: "X", created_at: "2026-01-03T00:00:00Z" },
            ],
          },
        })
      )
    ).toBeNull();
  });

  it("finds a reply on the product thread and converts it", () => {
    const html =
      '<p>Sorry to hear this.</p><p>Email <a href="mailto:a@b.com">a@b.com</a></p>';
    const reply = extractMerchantReply(
      raw({
        products: [
          {
            ...base.products[0],
            thread: [
              {
                type: "MERCHANT_COMMENT",
                author: " Uniworld Guest Relations ",
                comment: html,
                created_at: "2026-01-05T00:00:00Z",
              },
            ],
          },
        ],
      })
    );
    expect(reply).toEqual({
      text: "Sorry to hear this.\nEmail a@b.com",
      html,
      author: "Uniworld Guest Relations",
      createdAt: "2026-01-05T00:00:00Z",
    });
  });

  it("takes the latest merchant comment across service and product threads", () => {
    const reply = extractMerchantReply(
      raw({
        service: {
          ...base.service!,
          thread: [
            {
              type: "MERCHANT_COMMENT",
              author: "CS",
              comment: "Later reply",
              created_at: "2026-01-06T00:00:01Z",
            },
          ],
        },
        products: [
          {
            ...base.products[0],
            thread: [
              {
                type: "MERCHANT_COMMENT",
                author: "CS",
                comment: "Earlier",
                created_at: "2026-01-06T00:00:00Z",
              },
              { type: "CUSTOMER_RERATE", author: "Jane", created_at: "2026-01-07T00:00:00Z" },
            ],
          },
        ],
      })
    );
    expect(reply?.text).toBe("Later reply");
  });

  it("ignores a comment that is empty after conversion", () => {
    expect(
      extractMerchantReply(
        raw({
          service: {
            ...base.service!,
            thread: [
              {
                type: "MERCHANT_COMMENT",
                comment: "<p>&nbsp;</p>",
                created_at: "2026-01-06T00:00:00Z",
              },
            ],
          },
        })
      )
    ).toBeNull();
  });
});
