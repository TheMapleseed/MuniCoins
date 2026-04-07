//! Selective revelation (“flashlight”): which glyph cells fall inside a circular pointer region.
//! Cheap `distance_sq` tests — intended for a canvas/wgpu text grid; no GPU code here yet.

/// Pointer in the same coordinate space as glyph centers (typically CSS pixels).
#[derive(Clone, Copy, Debug, Default)]
pub struct Pointer {
    pub x: f32,
    pub y: f32,
}

/// For each glyph center, `true` if inside the open disk of radius `sqrt(radius_sq)`.
pub fn reveal_mask(centers: &[(f32, f32)], pointer: Pointer, radius_sq: f32) -> Vec<bool> {
    centers
        .iter()
        .map(|(gx, gy)| {
            let dx = pointer.x - gx;
            let dy = pointer.y - gy;
            dx * dx + dy * dy < radius_sq
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn center_revealed_edge_not() {
        let centers = vec![(10.0, 10.0), (100.0, 100.0)];
        let p = Pointer { x: 10.0, y: 10.0 };
        let m = reveal_mask(&centers, p, 5.0 * 5.0);
        assert!(m[0]);
        assert!(!m[1]);
    }
}
