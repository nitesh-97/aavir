import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Demo catalogue. The models are public glTF sample assets served with
 * permissive CORS headers, so nothing needs downloading to try the app.
 *
 * `heightCm` is the real printed height the listing claims. Sample assets are
 * authored at all sorts of scales, so this value — not the file's own units —
 * is what drives true-scale AR.
 */
const CATALOGUE = [
  {
    title: "Astronaut Desk Figure",
    description:
      "A clean-lined astronaut that prints without supports at 0.16 mm layers.\nSits well on a monitor stand or a bookshelf.",
    category: "Decor",
    material: "PLA",
    modelUrl: "https://modelviewer.dev/shared-assets/models/Astronaut.glb",
    basePrice: 1499,
    heightCm: 18,
    colors: [
      { name: "As modelled", hex: "#cccccc", useOriginal: true, priceDelta: 0 },
      { name: "Bone White", hex: "#efe9dd", useOriginal: false, priceDelta: 0 },
      { name: "Matte Black", hex: "#1b1b1f", useOriginal: false, priceDelta: 0 },
      { name: "Signal Orange", hex: "#e8622c", useOriginal: false, priceDelta: 80 },
    ],
    sizes: [
      { label: "Small", scale: 0.6, priceDelta: -400 },
      { label: "Standard", scale: 1, priceDelta: 0 },
      { label: "Large", scale: 1.6, priceDelta: 900 },
    ],
  },
  {
    title: "Expressive Robot Companion",
    description:
      "Articulated print-in-place robot. Ships assembled and already moving.",
    category: "Toys & Games",
    material: "PETG",
    modelUrl: "https://modelviewer.dev/shared-assets/models/RobotExpressive.glb",
    basePrice: 2190,
    heightCm: 22,
    colors: [
      { name: "As modelled", hex: "#cccccc", useOriginal: true, priceDelta: 0 },
      { name: "Deep Teal", hex: "#1f6f6b", useOriginal: false, priceDelta: 0 },
      { name: "Cherry Red", hex: "#c0392b", useOriginal: false, priceDelta: 0 },
      { name: "Silk Gold", hex: "#c9a227", useOriginal: false, priceDelta: 250 },
    ],
    sizes: [
      { label: "Desk", scale: 1, priceDelta: 0 },
      { label: "Shelf", scale: 1.8, priceDelta: 1400 },
    ],
  },
  {
    title: "Rubber Duck Debugger",
    description: "The classic desk companion. Prints in about two hours.",
    category: "Desk & Office",
    material: "PLA",
    modelUrl:
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb",
    basePrice: 449,
    heightCm: 9,
    colors: [
      { name: "As modelled", hex: "#cccccc", useOriginal: true, priceDelta: 0 },
      { name: "Duck Yellow", hex: "#f2c12e", useOriginal: false, priceDelta: 0 },
      { name: "Bubblegum", hex: "#e58fb0", useOriginal: false, priceDelta: 0 },
      { name: "Glow Green", hex: "#8ed081", useOriginal: false, priceDelta: 120 },
    ],
    sizes: [
      { label: "Tiny", scale: 0.5, priceDelta: -150 },
      { label: "Standard", scale: 1, priceDelta: 0 },
      { label: "Chonky", scale: 2.2, priceDelta: 700 },
    ],
  },
  {
    title: "Faceted Avocado Trinket",
    description: "A palm-sized avocado for the kitchen shelf or a bowl of fruit.",
    category: "Kitchen",
    material: "Silk PLA",
    modelUrl:
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/glTF-Binary/Avocado.glb",
    basePrice: 349,
    heightCm: 8,
    colors: [
      { name: "As modelled", hex: "#cccccc", useOriginal: true, priceDelta: 0 },
      { name: "Avocado Green", hex: "#5d7a3a", useOriginal: false, priceDelta: 0 },
      { name: "Cream", hex: "#f0e6d2", useOriginal: false, priceDelta: 0 },
    ],
    sizes: [
      { label: "Standard", scale: 1, priceDelta: 0 },
      { label: "Oversized", scale: 2.5, priceDelta: 550 },
    ],
  },
  {
    title: "Retro Boombox Shelf Piece",
    description:
      "A detailed 1980s boombox, printed as a solid display model.\nNo electronics — it is decor.",
    category: "Decor",
    material: "PLA",
    modelUrl:
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BoomBox/glTF-Binary/BoomBox.glb",
    basePrice: 1890,
    heightCm: 14,
    colors: [
      { name: "As modelled", hex: "#cccccc", useOriginal: true, priceDelta: 0 },
      { name: "Graphite", hex: "#2f3235", useOriginal: false, priceDelta: 0 },
      { name: "Ivory", hex: "#e9e4d8", useOriginal: false, priceDelta: 0 },
    ],
    sizes: [
      { label: "Compact", scale: 0.7, priceDelta: -500 },
      { label: "Standard", scale: 1, priceDelta: 0 },
      { label: "Statement", scale: 2, priceDelta: 2100 },
    ],
  },
  {
    title: "Hanging Lantern Shade",
    description:
      "Printed in translucent PETG so a warm bulb glows through the panels.\nFits a standard E27 pendant cord.",
    category: "Lighting",
    material: "PETG",
    modelUrl:
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Lantern/glTF-Binary/Lantern.glb",
    basePrice: 2650,
    heightCm: 34,
    colors: [
      { name: "As modelled", hex: "#cccccc", useOriginal: true, priceDelta: 0 },
      { name: "Amber", hex: "#d99a3f", useOriginal: false, priceDelta: 0 },
      { name: "Frosted White", hex: "#f4f1ea", useOriginal: false, priceDelta: 0 },
      { name: "Forest", hex: "#2c4a34", useOriginal: false, priceDelta: 200 },
    ],
    sizes: [
      { label: "Standard", scale: 1, priceDelta: 0 },
      { label: "Grand", scale: 1.5, priceDelta: 1800 },
    ],
  },
  {
    title: "Studio Bottle Display",
    description: "A weighted display bottle for photography sets and shelves.",
    category: "Art",
    material: "Resin",
    modelUrl:
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/WaterBottle/glTF-Binary/WaterBottle.glb",
    basePrice: 1250,
    heightCm: 24,
    colors: [
      { name: "As modelled", hex: "#cccccc", useOriginal: true, priceDelta: 0 },
      { name: "Slate", hex: "#4a5259", useOriginal: false, priceDelta: 0 },
      { name: "Blush", hex: "#dfb1a8", useOriginal: false, priceDelta: 0 },
    ],
    sizes: [
      { label: "Standard", scale: 1, priceDelta: 0 },
      { label: "Tall", scale: 1.35, priceDelta: 600 },
    ],
  },
] as const;

async function main() {
  const email = "demo@aavir.test";

  const seller = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      displayName: "Bright Layer Studio",
      passwordHash: await hash("demo1234", 10),
    },
  });

  // Re-seeding replaces the demo shop's catalogue rather than duplicating it.
  await prisma.listing.deleteMany({ where: { sellerId: seller.id } });

  for (const item of CATALOGUE) {
    // Width and depth are unknown until the glb loads in a browser, so only the
    // height — the dimension the seller actually commits to — is seeded. The
    // other two fill in the first time the listing is edited and saved.
    await prisma.listing.create({
      data: {
        title: item.title,
        description: item.description,
        category: item.category,
        material: item.material,
        modelUrl: item.modelUrl,
        basePrice: item.basePrice,
        currency: "INR",
        baseHeightCm: item.heightCm,
        sellerId: seller.id,
        colors: {
          create: item.colors.map((color, position) => ({ ...color, position })),
        },
        sizes: {
          create: item.sizes.map((size, position) => ({ ...size, position })),
        },
      },
    });
  }

  console.log(
    `Seeded ${CATALOGUE.length} listings for ${seller.displayName} (${email} / demo1234)`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
