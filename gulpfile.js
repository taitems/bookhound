var gulp = require('gulp');
var sass = require('gulp-sass');
var jshint = require('gulp-jshint');

gulp.task('watch', ['sass','lint'] ,function () {
  gulp.watch('./dist/styles/*.scss', ['sass']);
  gulp.watch('./dist/*.js', ['lint']);
});

gulp.task('sass', function () {
    gulp.src('./dist/styles/*.scss')
        .pipe(sass())
        .pipe(gulp.dest('./dist/styles'));
});

gulp.task('lint', function() {
  return gulp.src('./dist/scripts/*.js')
    .pipe(jshint())
  	.pipe(jshint.reporter('default'))
});

gulp.task('default', ['watch','sass', 'lint']);
