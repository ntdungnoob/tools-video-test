import { join, resolve } from "path";
import { unlink } from "fs/promises";
import type { Layer, RenderResultItem } from "./types";
import { sanitizeFilename } from "./utils";

export const VAAPI_DEVICE = "/dev/dri/renderD128";

export const FONT_MAP: Record<string, string> = {
  sans_bold: "assets/fonts/sans_bold.ttf",
  sans_regular: "assets/fonts/sans_regular.ttf",
  serif_bold: "assets/fonts/serif_bold.ttf",
  serif_regular: "assets/fonts/serif_regular.ttf",
  mono_bold: "assets/fonts/mono_bold.ttf"
};

export interface ResolvedLayer {
  fontPath: string;
  fontSize: number;
  fontColor: string;
  xExpr: string;
  yPos: number;
  animation: string;
  delay: number;
  isDynamic: boolean;
  isUppercase: boolean;
  text: string;
  shadow: boolean;
}

export function prepareResolvedLayers(layers: Layer[], name: string): ResolvedLayer[] {
  let layerList = [...layers];
  const hasDynamic = layerList.some(l => l.is_dynamic);
  if (!hasDynamic) {
    layerList.unshift({
      id: "name_layer",
      text: "DEAR {NAME}",
      y: 170,
      x: 0,
      align: "center",
      font_family: "sans_bold",
      font_size: 38,
      color: "#ffffff",
      is_dynamic: true,
      animation: "slide_up",
      uppercase: true,
      shadow: true
    });
  }

  const result: ResolvedLayer[] = [];

  for (const l of layerList) {
    const isDynamic = !!l.is_dynamic;
    const animation = l.animation || "none";
    let text = l.text || "";

    if (isDynamic && text.includes("{NAME}")) {
      const displayName = l.uppercase ? name.toUpperCase() : name;
      text = text.replace(/\{NAME\}/g, displayName);
    } else if (l.uppercase) {
      text = text.toUpperCase();
    }

    const alignment = l.align || "center";
    const xOffset = l.x || 0;
    let xExpr = `(w-text_w)/2+${xOffset}`;
    if (alignment === "left") {
      xExpr = `60+${xOffset}`;
    } else if (alignment === "right") {
      xExpr = `w-text_w-60+${xOffset}`;
    }

    const fontKey = l.font_family || "sans_bold";
    const fontRel = FONT_MAP[fontKey] || FONT_MAP["sans_bold"];
    const fontPath = resolve(process.cwd(), fontRel);

    const delay = (l as any).delay !== undefined ? Number((l as any).delay) : (animation !== "none" ? 0.8 : 0);

    result.push({
      fontPath,
      fontSize: Number(l.font_size) || 24,
      fontColor: l.color || "#ffffff",
      xExpr,
      yPos: Number(l.y) || 100,
      animation,
      delay,
      isDynamic,
      isUppercase: !!l.uppercase,
      text,
      shadow: l.shadow !== false
    });
  }

  return result;
}

export function buildDrawtextFilter(layer: ResolvedLayer, textFilePath: string, duration: number): string {
  const dur = Math.max(duration, 1);
  const delay = layer.delay ?? 0.8;
  const fadeIn = 1.4;
  const fadeOut = 1.0;
  const animEnd = delay + fadeIn;

  let yExpr = `${layer.yPos}`;
  let alphaExpr = "";

  if (layer.animation === "slide_up") {
    // Quad ease-out: chữ trượt lên 40px và hãm tốc mượt mà, sau khoảng delay 0.8s
    yExpr = `'if(lt(t,${delay}), ${layer.yPos}+40, if(lt(t,${animEnd}), ${layer.yPos}+40*(1-(t-${delay})/${fadeIn})*(1-(t-${delay})/${fadeIn}), ${layer.yPos}))'`;
    alphaExpr = `:alpha='if(lt(t,${delay}), 0, if(lt(t,${animEnd}), (t-${delay})/${fadeIn}, if(gt(t,${dur}-${fadeOut}), (${dur}-t)/${fadeOut}, 1)))'`;
  } else if (layer.animation === "fade" || layer.animation === "fade_in_out") {
    yExpr = `${layer.yPos}`;
    alphaExpr = `:alpha='if(lt(t,${delay}), 0, if(lt(t,${animEnd}), (t-${delay})/${fadeIn}, if(gt(t,${dur}-${fadeOut}), (${dur}-t)/${fadeOut}, 1)))'`;
  }

  const shadowPart = layer.shadow
    ? ":shadowcolor=black@0.65:shadowx=2:shadowy=2"
    : "";

  return (
    `drawtext=fontfile='${layer.fontPath}':` +
    `textfile='${textFilePath}':` +
    `fontsize=${layer.fontSize}:` +
    `fontcolor=${layer.fontColor}` +
    `${shadowPart}:` +
    `x=${layer.xExpr}:y=${yExpr}${alphaExpr}`
  );
}

export async function renderSingleVideo(options: {
  idx: number;
  name: string;
  layers: Layer[];
  templateVideo: string;
  duration: number;
  outputDir: string;
  scratchDir: string;
  useGpu: boolean;
}): Promise<RenderResultItem> {
  const { idx, name, layers, templateVideo, duration, outputDir, scratchDir, useGpu } = options;
  const slug = sanitizeFilename(name);
  const outFilename = `video_${slug}.mp4`;
  const outFilePath = join(outputDir, outFilename);

  const resolvedLayers = prepareResolvedLayers(layers, name);
  const tempFiles: string[] = [];
  const drawtextChain: string[] = [];

  for (let li = 0; li < resolvedLayers.length; li++) {
    const l = resolvedLayers[li];
    const textTmpPath = join(scratchDir, `web_txt_${idx}_${li}_${Date.now() % 100000}.txt`);
    await Bun.write(textTmpPath, l.text);
    tempFiles.push(textTmpPath);

    const filter = buildDrawtextFilter(l, textTmpPath, duration);
    drawtextChain.push(filter);
  }

  // Xây dựng chuỗi filter_complex
  let filterComplex = "";
  if (drawtextChain.length > 0) {
    const parts: string[] = [];
    for (let i = 0; i < drawtextChain.length; i++) {
      const inLbl = i === 0 ? "[0:v]" : `[t${i - 1}]`;
      const isLast = i === drawtextChain.length - 1;
      let outLbl = `[t${i}]`;
      if (isLast) {
        outLbl = useGpu ? "[sw]" : "[outv]";
      }
      parts.push(`${inLbl}${drawtextChain[i]}${outLbl}`);
    }
    if (useGpu) {
      parts.push("[sw]format=nv12,hwupload[outv]");
    }
    filterComplex = parts.join(";");
  } else {
    filterComplex = useGpu
      ? "[0:v]format=nv12,hwupload[outv]"
      : "[0:v]copy[outv]";
  }

  const cmd: string[] = ["ffmpeg", "-y"];
  if (useGpu) {
    cmd.push("-vaapi_device", VAAPI_DEVICE);
  } else {
    cmd.push("-threads", "1");
  }

  cmd.push("-i", templateVideo);
  cmd.push("-filter_complex", filterComplex);
  cmd.push("-map", "[outv]", "-map", "0:a?");

  if (duration > 0) {
    cmd.push("-t", duration.toString());
  }

  if (useGpu) {
    cmd.push("-c:v", "h264_vaapi", "-qp", "26", "-c:a", "copy", outFilePath);
  } else {
    cmd.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-c:a", "copy", outFilePath);
  }

  const t0 = performance.now();
  const proc = Bun.spawn(cmd, {
    stdout: "ignore",
    stderr: useGpu ? "pipe" : "ignore"
  });

  let stderrOutput = "";
  if (useGpu && proc.stderr) {
    const errBuf = await new Response(proc.stderr).text();
    stderrOutput = errBuf.slice(-800);
  }

  const exitCode = await proc.exited;
  const renderTime = (performance.now() - t0) / 1000;

  if (exitCode !== 0 && useGpu) {
    console.error(`  ❌ [GPU] Lỗi render '${name}': ${stderrOutput}`);
  }

  // Dọn dẹp file text tạm
  for (const tmp of tempFiles) {
    await unlink(tmp).catch(() => {});
  }

  const displayText = resolvedLayers[0]?.text || name;

  return {
    success: exitCode === 0,
    name,
    display_text: displayText,
    video_url: `/output/${outFilename}`,
    filename: outFilename,
    filepath: outFilePath,
    render_time: Math.round(renderTime * 100) / 100
  };
}
