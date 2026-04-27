import { describe, expect, it } from "vitest";
import { cardImageUrl } from "./cardImageUrl";

describe("cardImageUrl", () => {
  it("returns cached image_url when set", () => {
    expect(
      cardImageUrl({ name: "Lightning Bolt", image_url: "https://cdn.example/bolt.jpg" })
    ).toBe("https://cdn.example/bolt.jpg");
  });

  it("falls back to Scryfall when image_url is null", () => {
    expect(cardImageUrl({ name: "Lightning Bolt", image_url: null })).toBe(
      "https://api.scryfall.com/cards/named?exact=Lightning%20Bolt&format=image"
    );
  });

  it("falls back to Scryfall when image_url is undefined", () => {
    expect(cardImageUrl({ name: "Lightning Bolt" })).toBe(
      "https://api.scryfall.com/cards/named?exact=Lightning%20Bolt&format=image"
    );
  });

  it("strips trailing numeric suffixes (duplicate-pick labels)", () => {
    expect(cardImageUrl({ name: "Scalding Tarn 2" })).toBe(
      "https://api.scryfall.com/cards/named?exact=Scalding%20Tarn&format=image"
    );
  });

  it("URL-encodes special characters in the name", () => {
    expect(cardImageUrl({ name: "Sheoldred, the Apocalypse" })).toBe(
      "https://api.scryfall.com/cards/named?exact=Sheoldred%2C%20the%20Apocalypse&format=image"
    );
    expect(cardImageUrl({ name: "Bonecrusher Giant // Stomp" })).toBe(
      "https://api.scryfall.com/cards/named?exact=Bonecrusher%20Giant%20%2F%2F%20Stomp&format=image"
    );
  });
});
