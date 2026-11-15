import "dotenv/config";
import { callOne } from "../src/integrations/opennebula/xmlrpc-client.js";

const adminActor = process.env.OPENNEBULA_SERVER_AUTH_USER;

async function main() {
  const version = await callOne("one.system.version", [], adminActor);
  console.log("1. OpenNebula version:", version);

  const userXml = await callOne("one.user.info", [-1], "testuser");
  console.log(
    "2. Delegated testuser lookup succeeded (XML length):",
    userXml.length,
  );

  const templatePoolXml = await callOne(
    "one.templatepool.info",
    [-1, -1, -1],
    "testuser",
  );
  console.log(
    "3. Delegated template pool lookup succeeded (XML length):",
    templatePoolXml.length,
  );
}

main().catch((err) => {
  console.error("Spike failed:", err.message);
  process.exit(1);
});
