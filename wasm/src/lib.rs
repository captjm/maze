use wasm_bindgen::prelude::*;

struct Clip {
    id: String,
    duration: f64,
}

#[wasm_bindgen]
pub struct Engine {
    clips: Vec<Clip>,
    current_time: f64,
}

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Engine {
        Engine {
            clips: vec![],
            current_time: 0.0,
        }
    }

    pub fn add_clip(&mut self, id: String, duration: f64) {
        self.clips.push(Clip { id, duration });
    }

    pub fn seek(&mut self, time: f64) {
        self.current_time = time;
    }

    pub fn tick(&mut self, delta: f64) {
        self.current_time += delta;
    }

    pub fn get_current_clip(&self) -> String {
        let mut acc = 0.0;

        for clip in &self.clips {
            if self.current_time < acc + clip.duration {
                return clip.id.clone();
            }
            acc += clip.duration;
        }

        "END".to_string()
    }
}