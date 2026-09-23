import { parseInput, decodeInput } from "./core/io.mjs";
import { heightCandidates, diagnoseLines } from "./core/evidence.mjs";
import { buildModel, inspectModel, generateSections } from "./core/model.mjs";
import { loadDem } from "./core/dem.mjs";
self.onmessage = async ({ data: task }) => {
  try {
    let result;
    if (task.type === "parse") {
      const input = decodeInput(task.buffer, task.options.encoding);
      result = parseInput(input.text, task.name, task.options);
      result.encoding = input.encoding;
    } else if (task.type === "candidates")
      result = heightCandidates(task.sources, task.options);
    else if (task.type === "build") {
      const project = task.project,
        demPoints = await loadDem(project, {
          onProgress: (done, total) =>
            self.postMessage({
              id: task.id,
              progress: `DEM補助 ${done}/${total}`,
            }),
        });
      const model = buildModel(project, { demPoints });
      model.issues.push(...inspectModel(project, model));
      const errors = model.issues.filter((i) => i.level === "error");
      result = {
        model,
        sections: errors.length ? [] : generateSections(project, model),
        diagnostics: diagnoseLines(project.sources),
        demSpacing: project.settings.demSpacing,
      };
    } else throw Error("未対応の処理です");
    self.postMessage({ id: task.id, result });
  } catch (error) {
    self.postMessage({ id: task.id, error: error.message });
  }
};
