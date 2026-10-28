
import pkg from "stremio-addon-sdk";

const { addonBuilder, serveHTTP } = pkg;

const ARCHIVE = "https://archive.org";
const CATALOG_ID = "archive_public_domain_films";

const manifest = {
  id: "com.armi.kino-stremio",
  version: "1.1.0",
  name: "Kino para Stremio - Cine clasico",
  description: "Catalogo de prueba de peliculas clasicas de Internet Archive.",
  resources: ["catalog", "meta", "stream"],
  types: ["movie"],
  idPrefixes: ["ia:"],
  catalogs: [
    {
      type: "movie",
      id: CATALOG_ID,
      name: "Cine clasico",
      extra: [{ name: "search", isRequired: false }]
    }
  ]
};

const builder = new addonBuilder(manifest);

function cleanText(value) {
  return String(Array.isArray(value) ? value[0] ?? "" : value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeId(value) {
  return /^[A-Za-z0-9._-]{1,100}$/.test(value || "");
}

function toMeta(doc) {
  const id = String(doc.identifier || "");

  return {
    id: `ia:${id}`,
    type: "movie",
    name: cleanText(doc.title) || id,
    poster: `${ARCHIVE}/services/img/${encodeURIComponent(id)}`,
    description: cleanText(doc.description).slice(0, 700) ||
      "Pelicula clasica de Internet Archive.",
    releaseInfo: cleanText(doc.year) || undefined
  };
}

async function searchArchive(search = "", rows = 30) {
  const params = new URLSearchParams();

  params.set(
    "q",
    `collection:(feature_films) AND mediatype:(movies)${
      search ? ` AND title:(${search})` : ""
    }`
  );

  for (const field of [
    "identifier",
    "title",
    "year",
    "description"
  ]) {
    params.append("fl[]", field);
  }

  params.set("rows", String(rows));
  params.set("page", "1");
  params.set("output", "json");
  params.append("sort[]", "downloads desc");

  const response = await fetch(
    `${ARCHIVE}/advancedsearch.php?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Internet Archive respondio ${response.status}`);
  }

  const data = await response.json();

  return (data.response?.docs || []).filter(
    doc => safeId(doc.identifier)
  );
}

async function getArchiveItem(identifier) {
  if (!safeId(identifier)) return null;

  const response = await fetch(
    `${ARCHIVE}/metadata/${encodeURIComponent(identifier)}`
  );

  if (!response.ok) return null;

  return response.json();
}

builder.defineCatalogHandler(async args => {
  if (
    args.type !== "movie" ||
    (args.id && args.id !== CATALOG_ID)
  ) {
    return { metas: [] };
  }

  try {
    const query = String(args.extra?.search || "")
      .trim()
      .slice(0, 80);

    const docs = await searchArchive(query, 30);

    return { metas: docs.map(toMeta) };
  } catch (error) {
    console.error("Error en catalogo:", error.message);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async args => {
  const identifier = String(args.id || "").replace(/^ia:/, "");

  if (!safeId(identifier)) return { meta: null };

  try {
    const data = await getArchiveItem(identifier);

    if (!data?.metadata) return { meta: null };

    const metadata = data.metadata;

    const meta = toMeta({
      identifier,
      title: metadata.title,
      year: metadata.year || metadata.date,
      description: metadata.description
    });

    return {
      meta: {
        ...meta,
        background: meta.poster
      }
    };
  } catch (error) {
    console.error("Error en metadatos:", error.message);
    return { meta: null };
  }
});

builder.defineStreamHandler(async args => {
  const identifier = String(args.id || "").replace(/^ia:/, "");

  if (args.type !== "movie" || !safeId(identifier)) {
    return { streams: [] };
  }

  try {
    const data = await getArchiveItem(identifier);
    const files = Array.isArray(data?.files) ? data.files : [];

    const playable = files
      .filter(file =>
        /\.(mp4|m4v|webm)$/i.test(file.name || "") &&
        Number(file.size || 0) > 0
      )
      .sort((a, b) => {
        const rank = file =>
          /\.mp4$/i.test(file.name) ? 0 :
          /\.m4v$/i.test(file.name) ? 1 : 2;

        return rank(a) - rank(b) ||
          Number(b.size || 0) - Number(a.size || 0);
      });

    const file = playable[0];

    if (!file) return { streams: [] };

    const encodedFile = file.name
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    return {
      streams: [
        {
          title: `Internet Archive - ${file.format || "Video"}`,
          url: `${ARCHIVE}/download/${encodeURIComponent(identifier)}/${encodedFile}`
        }
      ]
    };
  } catch (error) {
    console.error("Error buscando video:", error.message);
    return { streams: [] };
  }
});

const port = Number(process.env.PORT || 7000);

serveHTTP(builder.getInterface(), { port });
