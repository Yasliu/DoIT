//! Draws the pill: a rounded body with the logo and "DoIT", as premultiplied RGBA pixels. The look
//! (size, corners, colours) is measured from the page's CSS and reported, so the native pill matches
//! whichever design and theme is active.

use std::sync::OnceLock;

use serde::Deserialize;
use tiny_skia::{FillRule, FilterQuality, IntSize, Paint, Path, PathBuilder, Pixmap, PixmapPaint, Stroke, Transform};

use crate::platform::PillFrame;

/// Inter SemiBold, cut down to the glyphs of "DoIT" (the page draws the pill label in Inter 600).
const FONT: &[u8] = include_bytes!("inter-doit.ttf");
/// `public/logo.png` pre-shrunk to a few sizes (premultiplied RGBA): bicubic scaling alone thins its
/// strokes when it shrinks a large source this much.
const LOGOS: [(u32, &[u8]); 3] = [
    (16, include_bytes!("logo-16.rgba")),
    (32, include_bytes!("logo-32.rgba")),
    (48, include_bytes!("logo-48.rgba")),
];
const LOGO_SIZE: f32 = 13.0;
const LOGO_GAP: f32 = 8.0;
const FONT_SIZE: f32 = 13.0;

/// The pill's look in logical px and 8-bit RGBA (not premultiplied), as the page measured it.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct PillLook {
    pub width: f32,
    pub height: f32,
    pub radius: f32,
    pub background: [u8; 4],
    pub border: [u8; 4],
    pub border_width: f32,
    pub text: [u8; 4],
    pub letter_spacing: f32,
}

impl Default for PillLook {
    /// The classic design's dark pill, until a page reports the real one.
    fn default() -> Self {
        Self {
            width: 172.0,
            height: 38.0,
            radius: 16.0,
            background: [11, 12, 16, 224],
            border: [255, 255, 255, 26],
            border_width: 1.0,
            text: [255, 255, 255, 217],
            letter_spacing: 0.26,
        }
    }
}

/// Renders the pill centred in a window of `size` physical px at `scale`, zoomed by `zoom` (hover
/// and press feedback).
pub fn render(look: &PillLook, size: (u32, u32), scale: f32, zoom: f32) -> Option<PillFrame> {
    let mut pixmap = Pixmap::new(size.0, size.1)?;
    let center = (size.0 as f32 / scale / 2.0, size.1 as f32 / scale / 2.0);
    // Logical px around the window's centre from here on.
    let t = Transform::from_scale(scale, scale).pre_translate(center.0, center.1).pre_scale(zoom, zoom);

    let (w, h) = (look.width, look.height);
    let body = rounded_rect(-w / 2.0, -h / 2.0, w, h, look.radius)?;
    pixmap.fill_path(&body, &paint(look.background), FillRule::Winding, t, None);
    if look.border_width > 0.0 && look.border[3] > 0 {
        let inset = look.border_width / 2.0;
        if let Some(edge) = rounded_rect(-w / 2.0 + inset, -h / 2.0 + inset, w - look.border_width, h - look.border_width, look.radius - inset) {
            let stroke = Stroke { width: look.border_width, ..Stroke::default() };
            pixmap.stroke_path(&edge, &paint(look.border), &stroke, t, None);
        }
    }

    let label = Label::new(look.letter_spacing)?;
    let left = -(LOGO_SIZE + LOGO_GAP + label.width) / 2.0;
    if let Some((source, logo)) = logo(LOGO_SIZE * scale * zoom) {
        let fit = LOGO_SIZE / source as f32;
        let at = t.pre_translate(left, -LOGO_SIZE / 2.0).pre_scale(fit, fit);
        let quality = PixmapPaint { quality: FilterQuality::Bicubic, ..PixmapPaint::default() };
        pixmap.draw_pixmap(0, 0, logo.as_ref(), &quality, at, None);
    }
    if let Some(text) = &label.path {
        let baseline = label.cap_height / 2.0;
        pixmap.fill_path(text, &paint(look.text), FillRule::Winding, t.pre_translate(left + LOGO_SIZE + LOGO_GAP, baseline), None);
    }

    Some(PillFrame { width: size.0, height: size.1, scale: scale as f64, rgba: pixmap.take() })
}

fn paint([r, g, b, a]: [u8; 4]) -> Paint<'static> {
    let mut paint = Paint::default();
    paint.set_color_rgba8(r, g, b, a);
    paint.anti_alias = true;
    paint
}

/// The smallest logo at least `px` wide (else the largest), with its size.
fn logo(px: f32) -> Option<(u32, &'static Pixmap)> {
    static PIXMAPS: OnceLock<Vec<(u32, Pixmap)>> = OnceLock::new();
    let pixmaps = PIXMAPS.get_or_init(|| {
        LOGOS.iter().filter_map(|&(n, rgba)| Some((n, Pixmap::from_vec(rgba.to_vec(), IntSize::from_wh(n, n)?)?))).collect()
    });
    pixmaps.iter().find(|(n, _)| *n as f32 >= px).or(pixmaps.last()).map(|(n, p)| (*n, p))
}

fn rounded_rect(x: f32, y: f32, w: f32, h: f32, radius: f32) -> Option<Path> {
    let r = radius.clamp(0.0, w.min(h) / 2.0);
    // Distance of the cubic control points that best approximates a quarter circle.
    let k = 0.552_284_8 * r;
    let mut pb = PathBuilder::new();
    pb.move_to(x + r, y);
    pb.line_to(x + w - r, y);
    pb.cubic_to(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
    pb.line_to(x + w, y + h - r);
    pb.cubic_to(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
    pb.line_to(x + r, y + h);
    pb.cubic_to(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
    pb.line_to(x, y + r);
    pb.cubic_to(x, y + r - k, x + r - k, y, x + r, y);
    pb.close();
    pb.finish()
}

/// "DoIT" as one path, starting at x = 0 on the baseline.
struct Label {
    path: Option<Path>,
    width: f32,
    cap_height: f32,
}

impl Label {
    fn new(letter_spacing: f32) -> Option<Self> {
        let face = ttf_parser::Face::parse(FONT, 0).ok()?;
        let scale = FONT_SIZE / face.units_per_em() as f32;
        let mut pb = PathBuilder::new();
        let mut x = 0.0;
        for c in "DoIT".chars() {
            let glyph = face.glyph_index(c)?;
            face.outline_glyph(glyph, &mut Outline { pb: &mut pb, x, scale });
            x += face.glyph_hor_advance(glyph).unwrap_or(0) as f32 * scale + letter_spacing;
        }
        let cap_height = face.capital_height().unwrap_or(1490) as f32 * scale;
        Some(Self { path: pb.finish(), width: x - letter_spacing, cap_height })
    }
}

/// Feeds a glyph outline (font units, y up) into a path (px, y down) at pen position `x`.
struct Outline<'a> {
    pb: &'a mut PathBuilder,
    x: f32,
    scale: f32,
}

impl Outline<'_> {
    fn at(&self, x: f32, y: f32) -> (f32, f32) {
        (self.x + x * self.scale, -y * self.scale)
    }
}

impl ttf_parser::OutlineBuilder for Outline<'_> {
    fn move_to(&mut self, x: f32, y: f32) {
        let (x, y) = self.at(x, y);
        self.pb.move_to(x, y);
    }

    fn line_to(&mut self, x: f32, y: f32) {
        let (x, y) = self.at(x, y);
        self.pb.line_to(x, y);
    }

    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        let ((x1, y1), (x, y)) = (self.at(x1, y1), self.at(x, y));
        self.pb.quad_to(x1, y1, x, y);
    }

    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        let ((x1, y1), (x2, y2), (x, y)) = (self.at(x1, y1), self.at(x2, y2), self.at(x, y));
        self.pb.cubic_to(x1, y1, x2, y2, x, y);
    }

    fn close(&mut self) {
        self.pb.close();
    }
}

#[cfg(test)]
mod tests {
    use super::{render, PillLook};

    #[test]
    fn the_pill_fills_its_body_and_leaves_the_margin_clear() {
        let look = PillLook { background: [250, 250, 250, 255], ..PillLook::default() };
        // A 200x52 window at 2x.
        let frame = render(&look, (400, 104), 2.0, 1.0).expect("frame");
        let alpha = |x: u32, y: u32| frame.rgba[((y * frame.width + x) * 4 + 3) as usize];
        assert_eq!(alpha(2, 2), 0, "the corner margin stays transparent");
        assert_eq!(alpha(40, 52), 255, "the body is opaque");
        // The label is drawn: some pixel in the middle of the body is not the background colour.
        let row = 52 * frame.width as usize * 4;
        let ink = (150..250).any(|x| frame.rgba[row + x * 4] < 200);
        assert!(ink, "the logo and label are drawn in the middle");
    }
}
