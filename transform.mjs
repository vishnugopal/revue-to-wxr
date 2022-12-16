import path from "path";
import fs from "fs";

import StreamZip from "node-stream-zip";
import neatCsv from "neat-csv";
import { program } from "commander";

import wxrImporter from "./wxr-importer/importer.js";

const NOT_SAFE_IN_XML_1_0 =
  /[^\x09\x0A\x0D\x20-\xFF\x85\xA0-\uD7FF\uE000-\uFDCF\uFDE0-\uFFFD]/gm;

function sanitizeStringForXML(theString) {
  return theString.replace(NOT_SAFE_IN_XML_1_0, "");
}

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

  return entryMap;
}

async function getPosts(zipFile, filesMap) {
  const zip = new StreamZip.async({ file: zipFile });
  const itemsRaw = await zip.entryData(filesMap["items"]);
  const items = JSON.parse(itemsRaw);
  const issue_ids = new Set(items.map((t) => t.issue_id));

  const issues = [...issue_ids].map((id) => {
    const content = items
      .filter((i) => i.issue_id === id)
      .sort((a) => a.order)
      .map((t) => {
        switch (t.item_type) {
          case "link":
            let link_content =
              "<a href=" + t.url + ">" + t.description + "</a>";

            if (t.image) {
              link_content += "<img src=" + t.image + " />";
            }

            return link_content;
          default:
            return t.description;
        }
      });

    return {
      id,
      contentEncoded: sanitizeStringForXML(content.join("")),
    };
  });

  const issuesRaw = await zip.entryData(filesMap["issues"]);
  const records = await neatCsv(issuesRaw);

  const recordsMappedById = records.reduce((acc, record) => {
    acc[record.id] = record;
    return acc;
  }, {});

  const issuesWithMetaData = issues.map((issue) => {
    const record = recordsMappedById[issue.id];
    return { ...issue, title: record.subject, published_at: record.sent_at };
  });

  // Do not forget to close the file once you're done
  await zip.close();

  return issuesWithMetaData;
}

function postsToWXR(posts) {
  const importer = new wxrImporter();
  posts.forEach((post) => {
    importer.addPost(post);
  });
  importer.addAuthor({
    display_name: "Revue Author",
    email: "email@example.net",
  });
  return importer.stringify();
}

program
  .name("revue-to-wxr")
  .description("CLI to convert Revue export to WXR")
  .version("0.1.0");

program
  .command("convert")
  .description("Convert a Revue export to WXR")
  .argument("<filepath>", "path to Revue export zip file")
  .option("--output-path", "path to the output WXR file")
  .action(async (zipFile, options) => {
    const filesMap = await parseFilesFromZip(zipFile);
    const posts = await getPosts(zipFile, filesMap);

    const wxr = postsToWXR(posts);
    const outputPath =
      options.outputPath ??
      path.join(path.dirname(zipFile), `${path.parse(zipFile).name}.xml`);
    fs.writeFileSync(outputPath, wxr);
  });

program.parse();
