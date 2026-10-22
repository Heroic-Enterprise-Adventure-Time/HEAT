// Copies the art the client draws, art/heroes, art/monsters, art/props,
// art/facilities, art/ground and art/icons, into generated/art beside this
// package, which angular.json serves at /art. Angular takes assets only from inside its workspace root
// (packages/client), and the art's one home is art/ at the repository root
// with its provenance, so the build copies it rather than the repository
// keeping two. Run before every serve, build and test; generated/ is ignored.
import { cpSync, rmSync } from "node:fs";

const from = new URL("../../../art/", import.meta.url);
const to = new URL("../generated/art/", import.meta.url);

rmSync(to, { recursive: true, force: true });
for (const dir of ["heroes", "monsters", "props", "facilities", "ground", "icons"]) {
  cpSync(new URL(`${dir}/`, from), new URL(`${dir}/`, to), {
    recursive: true,
    filter: (source) => !/\.[a-z]+$/i.test(source) || /\.(png|json)$/i.test(source),
  });
}
console.log("copied art/heroes, art/monsters, art/props, art/facilities, art/ground and art/icons into packages/client/generated/art");
