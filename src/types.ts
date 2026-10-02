export interface Layer {
  id?: string;
  text: string;
  y: number;
  x?: number;
  align?: "center" | "left" | "right";
  font_family?: string;
  font_size?: number;
  color?: string;
  opacity?: number;
  is_dynamic?: boolean;
  animation?: "none" | "slide_up" | "fade" | "fade_in_out";
  uppercase?: boolean;
  shadow?: boolean;
  line_spacing?: number;
}

export interface RenderPayload {
  layers: Layer[];
  names: string[];
  video_url?: string;
  duration?: number;
  use_gpu?: boolean;
  batch_size?: number;
}

export interface RenderResultItem {
  success: boolean;
  name: string;
  display_text: string;
  video_url: string;
  filename: string;
  filepath: string;
  render_time: number;
}

export interface RenderResponse {
  success: boolean;
  count: number;
  total_time: number;
  avg_time: number;
  sample_preview_url: string;
  zip_size_mb: number;
  items: RenderResultItem[];
}
