var gulp = require('gulp');
var sass = require('gulp-sass');
var jshint = require('gulp-jshint');

gulp.task('watch', ['sass','lint'] ,function () {
  gulp.watch('./dist/sass/*.scss', ['sass']);
  gulp.watch('./dist/*.js', ['lint']);
});

gulp.task('sass', function () {	
    gulp.src('./dist/sass/*.scss')
        .pipe(sass())
        .pipe(gulp.dest('./dist/css'));
});

gulp.task('lint', function() {
  return gulp.src('./dist/*.js')
    .pipe(jshint())
  	.pipe(jshint.reporter('default'))
});

gulp.task('default', ['watch','sass', 'lint']);	
