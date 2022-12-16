import StreamZip from "node-stream-zip";

function mapToEntryKind(name) {
  if (name.startsWith("issue_stats_") && name.endsWith(".csv")) {
    return "issue_stats";
  } else if (name.startsWith("issues_") && name.endsWith(".csv")) {
    return "issues";
  } else if (name.startsWith("items_") && name.endsWith(".json")) {
    return "items";
  } else if (name.startsWith("subscribers_") && name.endsWith(".csv")) {
    return "subscribers";
  }
}

async function parseFilesFromZip(zipFile) {
  const zip = new StreamZip.async({ file: zipFile });

  const entries = await zip.entries();
  let entryMap = {};
  for (const entry of Object.values(entries)) {
    if (mapToEntryKind(entry.name)) {
      entryMap[mapToEntryKind(entry.name)] = entry.name;
    }
  }

  // Do not forget to close the file once you're done
  await zip.close();
}

await parseFilesFromZip(process.argv[2]);

process.exit(0);
// Place the JSON exported from revue in the same directory, and rename it to items.json
// Or just change the path here
const items = require("./items.json");
const issue_ids = new Set(items.map((t) => t.issue_id));
const fs = require("fs");

const issues = [...issue_ids].map((id) => {
  const content = items
    .filter((i) => i.issue_id === id)
    .sort((a) => a.order)
    .map((t) => {
      switch (t.item_type) {
        case "link":
          let link_content = "<a href=" + t.url + ">" + t.description + "</a>";

          if (t.image) {
            link_content += "<img src=" + t.image + " />";
          }

          return link_content;
        default:
          return t.description;
      }
    });

  return {
    issue_id: id,
    content: content.join(""),
  };
});

fs.mkdirSync("./result");
issues.map((issue) => {
  fs.writeFileSync("./result/" + issue.issue_id + ".html", issue.content);
});
