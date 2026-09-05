/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */
import gulp from 'gulp';
import gap from 'gulp-append-prepend';
import watch from 'gulp-watch';
import filter from 'gulp-filter';

gulp.task('resources-to-lib-watch', function () {
  const f = filter(['**', '!src/**/*.js', '!src/**/*.ts', '!src/**/*.tsx']);
  // Editors save through temp files (`foo.ts.tmp.<pid>.<hash>`, `.#foo`,
  // `foo~`) that are renamed away before the watcher can stat them. Excluded
  // at both levels — the glob and chokidar's `ignored` — so the events never
  // fire; and a file that still vanishes between its event and the stat
  // costs a log line, not the whole watch.
  const stream = watch(
    ['src/**/*', '!src/**/*.tmp.*', '!src/**/.*', '!src/**/*~'],
    {
      ignoreInitial: false,
      ignored: [/\.tmp\.[^/]*$/, /(^|[/\\])\.[^/\\]*$/, /~$/],
    },
  );
  stream.on('error', error => {
    console.warn('[resources-to-lib-watch] skipped:', error.message);
  });
  return stream.pipe(f).pipe(gulp.dest('./lib/'));
});

gulp.task('resources-to-lib', async function () {
  const f = filter(['**', '!src/**/*.js', '!src/**/*.ts', '!src/**/*.tsx']);
  gulp.src('./src/**/*.*').pipe(f).pipe(gulp.dest('./lib/'));
  return;
});

gulp.task('licenses', async function () {
  // this is to add Datalayer licenses in the production mode for the minified js
  gulp
    .src('build/static/js/*chunk.js', { base: './' })
    .pipe(
      gap.prependText(`/*!

=========================================================
* Datalayer
=========================================================

* Product Page: https://datalayer.io
* Copyright 2024 Datalayer (https://datalayer.io)

=========================================================

*/`),
    )
    .pipe(gulp.dest('./', { overwrite: true }));

  // this is to add Datalayer licenses in the production mode for the minified html
  gulp
    .src('build/index.html', { base: './' })
    .pipe(
      gap.prependText(`<!--

=========================================================
* Datalayer
=========================================================

* Product Page: https://datalayer.io
* Copyright 2024 Datalayer (https://datalayer.io)

=========================================================

-->`),
    )
    .pipe(gulp.dest('./', { overwrite: true }));

  // this is to add Datalayer licenses in the production mode for the minified css
  gulp
    .src('build/static/css/*chunk.css', { base: './' })
    .pipe(
      gap.prependText(`/*!

=========================================================
* Datalayer
=========================================================

* Product Page: https://datalayer.io
* Copyright 2024 Datalayer (https://datalayer.io)

=========================================================

*/`),
    )
    .pipe(gulp.dest('./', { overwrite: true }));
  return;
});
