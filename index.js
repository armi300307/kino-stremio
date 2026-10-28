
import pkg from "stremio-addon-sdk";

const { addonBuilder, serveHTTP } = pkg;

const manifest = {
  id: "com.armi.kino-stremio",
  version: "1.0.0",
  name: "Kino para Stremio",
  description: "Proyecto de adaptación de complementos de Kino",
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: []
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async () => ({
  metas: []
}));

builder.defineMetaHandler(async () => ({
  meta: null
}));

builder.defineStreamHandler(async () => ({
  streams: []
}));

serveHTTP(builder.getInterface(), {
  port: process.env.PORT || 7000
});
