//! Data-layer timings on a realistic local database (run with
//! `cargo test --release -- --ignored bench --nocapture`). Numbers go in
//! docs/architecture.md#validation.

use std::time::Instant;

use chrono::NaiveDate;

use super::notes::{self, CreateNote, NoteQuery};
use super::search;
use super::tasks::{self, CreateTask, TaskQuery};
use super::test_support::db;

#[test]
#[ignore = "benchmark"]
fn bench_realistic_database() {
    let db = db();
    let started = Instant::now();
    db.write(|tx| {
        for i in 0..5_000 {
            notes::create(
                tx,
                CreateNote {
                    body: format!(
                        "Nota {i}\nReunião sobre o projeto {} — ação {}",
                        i % 97,
                        i % 13
                    ),
                    ..Default::default()
                },
            )?;
        }
        for i in 0..5_000 {
            tasks::create(
                tx,
                CreateTask {
                    title: format!("Tarefa {i} 2FA {}", i % 50),
                    description: "Descrição com acentuação e café ☕".into(),
                    due_date: (i % 3 == 0).then(|| format!("2026-11-{:02}", 1 + i % 28)),
                    ..Default::default()
                },
            )?;
        }
        Ok(((), crate::domain::change::ChangeSet::new()))
    })
    .unwrap();
    println!("insert 10k items: {:?}", started.elapsed());

    let today = NaiveDate::from_ymd_opt(2026, 11, 6).unwrap();
    let time = |label: &str, f: &dyn Fn()| {
        let runs = 20;
        let start = Instant::now();
        for _ in 0..runs {
            f();
        }
        println!("{label}: {:?} per run", start.elapsed() / runs);
    };
    time("search '2fa' (10k items)", &|| {
        db.read(|c| search::search(c, "2fa", None)).unwrap();
    });
    time("search 'reuniao acao' (accent-insensitive)", &|| {
        db.read(|c| search::search(c, "reuniao acao", None))
            .unwrap();
    });
    time("list tasks: All (5k)", &|| {
        db.read(|c| tasks::list(c, &TaskQuery::default(), today))
            .unwrap();
    });
    time("list tasks: Today", &|| {
        db.read(|c| {
            tasks::list(
                c,
                &TaskQuery {
                    view: tasks::TaskView::Today,
                    ..Default::default()
                },
                today,
            )
        })
        .unwrap();
    });
    time("list notes (5k)", &|| {
        db.read(|c| notes::list(c, &NoteQuery::default())).unwrap();
    });
    time("complete + reopen a task (2 writes)", &|| {
        let id = db
            .read(|c| tasks::list(c, &TaskQuery::default(), today))
            .unwrap()[0]
            .id
            .clone();
        db.write(|tx| tasks::set_completed(tx, &id, true)).unwrap();
        db.write(|tx| tasks::set_completed(tx, &id, false)).unwrap();
    });
}
