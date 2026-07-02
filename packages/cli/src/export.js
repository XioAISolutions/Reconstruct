import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function bullets(items, empty = "None recorded.") {
  return items?.length ? items.map((item) => `- ${item}`).join("\n") : empty;
}

function screens(spec) {
  return spec.screens?.length
    ? spec.screens.map((screen) => `- \`${screen.route}\` — ${screen.title} (${screen.status}, ${Math.round(screen.confidence * 100)}%)`).join("\n")
    : "No screens recorded.";
}

function components(spec) {
  return spec.components?.length
    ? spec.components.map((component) => `- **${component.name}** — ${component.type}`).join("\n")
    : "No components recorded.";
}

export async function exportAppSpec(spec, target, outDir) {
  const files = {
    "PRODUCT.md": `# Product specification\n\n## Product\n\n**${spec.app.name}**\n\nSource: ${spec.app.sourceUrl}\n\n## Screens\n\n${screens(spec)}\n\n## Assumptions\n\n${bullets(spec.assumptions)}\n\n## Unknowns\n\n${bullets(spec.unknowns)}\n`,
    "ARCHITECTURE.md": `# Architecture brief\n\n## Component inventory\n\n${components(spec)}\n\n## User flows\n\n${bullets((spec.flows || []).map((flow) => `${flow.name}: ${flow.steps.join(" → ")}`))}\n`,
    "DESIGN_SYSTEM.md": `# Design system\n\n\`\`\`json\n${JSON.stringify(spec.designSystem, null, 2)}\n\`\`\`\n`,
    "IMPLEMENTATION_PLAN.md": `# Implementation plan\n\n1. Create the application shell and recorded routes.\n2. Implement shared components from the inventory.\n3. Reproduce screen structure using the evidence paths in appspec.json.\n4. Implement only evidence-backed behaviour.\n5. Add the acceptance tests.\n6. Review assumptions and unknowns before production use.\n`,
    "ACCEPTANCE_TESTS.md": `# Acceptance tests\n\n${(spec.acceptanceTests || []).map((test) => `## ${test.id}\n\n- **Given:** ${test.given}\n- **When:** ${test.when}\n- **Then:** ${test.then}`).join("\n\n") || "No acceptance tests recorded."}\n`
  };

  if (target === "cursor") {
    files[".cursor/rules/reconstruct.mdc"] = "---\ndescription: Build from a Reconstruct AppSpec and preserve evidence provenance.\nalwaysApply: true\n---\n\nRead the generated documents and appspec.json before coding. Implement observed behaviour first, review inferences carefully, and flag unknown requirements instead of silently inventing them.\n";
  } else if (target === "claude") {
    files["CLAUDE.md"] = "Build from the Reconstruct documents. Preserve evidence-backed behaviour and keep assumptions explicit.\n";
  } else if (target === "codex") {
    files["AGENTS.md"] = "Use the Reconstruct AppSpec as the product contract. Implement observed behaviour first and surface unknowns before irreversible architecture choices.\n";
  }

  await mkdir(outDir, { recursive: true });
  const written = [];
  for (const [relativePath, content] of Object.entries(files)) {
    const output = join(outDir, relativePath);
    await mkdir(join(output, ".."), { recursive: true });
    await writeFile(output, content, "utf8");
    written.push(output);
  }
  return written;
}
