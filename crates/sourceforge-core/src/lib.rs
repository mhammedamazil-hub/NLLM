//! Source-grounded primitives. No I/O, provider calls, or execution of imported content.

#[derive(Clone, Debug, PartialEq)]
pub struct Passage {
    pub source_id: String,
    pub source_name: String,
    pub text: String,
    pub line_start: usize,
    pub line_end: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Hit {
    pub passage: Passage,
    pub score: f64,
}

pub fn normalize(text: &str) -> String {
    text.replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\0', "")
        .trim_end()
        .to_owned()
}

pub fn chunk(text: &str, max_chars: usize) -> Vec<(String, usize, usize)> {
    if max_chars == 0 {
        return Vec::new();
    }
    let mut result = Vec::new();
    let mut current = String::new();
    let mut start = 1usize;
    let mut end = 0usize;
    for (idx, line) in normalize(text).lines().enumerate() {
        let n = idx + 1;
        if line.chars().count() > max_chars {
            if !current.trim().is_empty() {
                result.push((current.trim().to_owned(), start, end));
            }
            current.clear();
            let chars: Vec<char> = line.chars().collect();
            for piece in chars.chunks(max_chars) {
                result.push((piece.iter().collect(), n, n));
            }
            start = n + 1;
            end = n;
            continue;
        }
        let separator = if current.is_empty() { 0 } else { 1 };
        let add = line.chars().count() + separator;
        if current.chars().count() + add > max_chars && !current.is_empty() {
            result.push((current.trim().to_owned(), start, end));
            current.clear();
        }
        if current.is_empty() {
            start = n;
        }
        if !current.is_empty() {
            current.push('\n');
        }
        current.push_str(line);
        end = n;
    }
    if !current.trim().is_empty() {
        result.push((current.trim().to_owned(), start, end));
    }
    result
}

fn terms(s: &str) -> Vec<String> {
    s.split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() >= 2)
        .map(str::to_lowercase)
        .collect()
}

pub fn retrieve(passages: &[Passage], query: &str, limit: usize) -> Vec<Hit> {
    let query_terms = terms(query);
    if query_terms.is_empty() {
        return Vec::new();
    }
    let mut hits: Vec<Hit> = passages
        .iter()
        .filter_map(|p| {
            let words = terms(&p.text);
            let mut score = 0.0;
            for q in &query_terms {
                let frequency = words.iter().filter(|w| *w == q).count() as f64;
                if frequency > 0.0 {
                    score += frequency * (1.0 + (words.len() as f64 / 80.0).ln());
                }
                if terms(&p.source_name).contains(q) {
                    score += 0.5;
                }
            }
            if !query.trim().is_empty() && p.text.to_lowercase().contains(&query.to_lowercase()) {
                score += 1.5;
            }
            (score > 0.0).then_some(Hit {
                passage: p.clone(),
                score,
            })
        })
        .collect();
    hits.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| a.passage.source_id.cmp(&b.passage.source_id))
    });
    hits.truncate(limit);
    hits
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunking_preserves_line_ranges_and_bounds() {
        let chunks = chunk("first line\nsecond line\nthird", 12);
        assert_eq!(chunks.first().unwrap().1, 1);
        assert_eq!(chunks.last().unwrap().2, 3);
        assert!(chunks.iter().all(|c| c.0.chars().count() <= 12));
    }

    #[test]
    fn retrieval_is_deterministic_and_source_backed() {
        let p = Passage {
            source_id: "src-1".into(),
            source_name: "Ocean report".into(),
            text: "Ocean temperature rises".into(),
            line_start: 4,
            line_end: 4,
        };
        let hits = retrieve(&[p.clone()], "ocean temperature", 5);
        assert_eq!(hits[0].passage.source_id, p.source_id);
        assert!(retrieve(&[p], "volcano erupts", 5).is_empty());
    }
}
