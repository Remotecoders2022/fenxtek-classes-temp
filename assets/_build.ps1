$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$src = [System.IO.File]::ReadAllText((Join-Path $root 'fenxtek-v2.html'), [System.Text.Encoding]::UTF8)
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Section([string]$id) {
  $m = [regex]::Match($src, '(?s)<section[^>]*\bid="' + [regex]::Escape($id) + '".*?</section>')
  if (-not $m.Success) { throw "section not found: $id" }
  return $m.Value
}

$hero     = Get-Section 'top'
$practice = Get-Section 'practice'
$courses  = Get-Section 'courses'
$method   = Get-Section 'method'
$why      = Get-Section 'why'
$director = Get-Section 'director'
$exams    = Get-Section 'exams'
$voices   = Get-Section 'voices'
$pricing  = Get-Section 'pricing'
$faq      = Get-Section 'faq'
$join     = Get-Section 'join'
$marquee  = [regex]::Match($src, '(?s)<!-- ============ MARQUEE ============ -->\s*(<div class="marquee".*?<div class="mq">.*?</div>\s*<div class="mq">.*?</div>\s*</div>\s*</div>)').Groups[1].Value

$cta = @'
<section class="cta-band on-dark" id="cta">
  <div class="wrap">
    <span class="eyebrow eyebrow--lime">Admissions open - 2026</span>
    <h2 class="h2" style="margin-top:12px">Your success is <em>our priority.</em></h2>
    <p class="lead">Start with a free demo dictation. No sign-up, no payment - just you and the clock.</p>
    <div class="cta-actions">
      <a class="btn btn--lime" href="contact.html"><span>Book a free demo</span> <svg><use href="#i-arr"/></svg></a>
      <a class="btn btn--light" href="auth.html"><span>Student portal</span></a>
    </div>
  </div>
</section>
'@

$explore = @'
<section class="section section--tint" id="explore">
  <div class="wrap">
    <div class="sec-head" data-reveal>
      <span class="eyebrow">Explore FenxTek</span>
      <h2 class="h2">Everything in <em>one place.</em></h2>
      <p class="lead">Courses, exam patterns, the method and the people behind the practice - each with its own page.</p>
      <span class="sec-note"><b>07</b>pages<br>one academy</span>
    </div>
    <div class="explore-grid">
      <a class="explore-card" href="courses.html" data-reveal>
        <span class="ec-n">01 / Courses</span>
        <span class="ec-arr"><svg><use href="#i-arr-ur"/></svg></span>
        <h3>Batches &amp; fees</h3>
        <p>Eight live batches with exam-focused dictation, feedback and clear target speeds.</p>
      </a>
      <a class="explore-card" href="exams.html" data-reveal style="--d:.05s">
        <span class="ec-n">02 / Exams</span>
        <span class="ec-arr"><svg><use href="#i-arr-ur"/></svg></span>
        <h3>Every steno path</h3>
        <p>Parliament, high courts, central and state recruitments - one academy, every pattern.</p>
      </a>
      <a class="explore-card" href="method.html" data-reveal style="--d:.1s">
        <span class="ec-n">03 / Method</span>
        <span class="ec-arr"><svg><use href="#i-arr-ur"/></svg></span>
        <h3>Three steps, daily</h3>
        <p>Choose the exam, practise at target speed, track improvement. Repeat.</p>
      </a>
      <a class="explore-card" href="about.html" data-reveal style="--d:.05s">
        <span class="ec-n">04 / About</span>
        <span class="ec-arr"><svg><use href="#i-arr-ur"/></svg></span>
        <h3>The people</h3>
        <p>Meet the director and the students who turned daily practice into results.</p>
      </a>
      <a class="explore-card" href="membership.html" data-reveal style="--d:.1s">
        <span class="ec-n">05 / Membership</span>
        <span class="ec-arr"><svg><use href="#i-arr-ur"/></svg></span>
        <h3>One plan</h3>
        <p>All courses, dictations and mock tests from a single monthly membership.</p>
      </a>
      <a class="explore-card" href="contact.html" data-reveal style="--d:.15s">
        <span class="ec-n">06 / Contact</span>
        <span class="ec-arr"><svg><use href="#i-arr-ur"/></svg></span>
        <h3>Talk to us</h3>
        <p>Phone, email, Telegram or Instagram - start with a free demo passage.</p>
      </a>
    </div>
  </div>
</section>
'@

function Fix-Links([string]$html) {
  $map = [ordered]@{
    'href="#top"'      = 'href="index.html"'
    'href="#practice"' = 'href="index.html#practice"'
    'href="#courses"'  = 'href="courses.html"'
    'href="#method"'   = 'href="method.html"'
    'href="#why"'      = 'href="method.html#why"'
    'href="#director"' = 'href="about.html"'
    'href="#exams"'    = 'href="exams.html"'
    'href="#voices"'   = 'href="about.html#voices"'
    'href="#pricing"'  = 'href="membership.html"'
    'href="#faq"'      = 'href="membership.html#faq"'
    'href="#join"'     = 'href="contact.html"'
  }
  foreach ($k in $map.Keys) { $html = $html.Replace($k, $map[$k]) }
  return $html
}

# CMS hooks on the shared sections
$hero = $hero.Replace('<p class="hero-lead">', '<p class="hero-lead" data-cms="heroLead">')
$hero = $hero.Replace('data-count="3000"', 'data-count="3000" data-cms-count="students"')
$hero = $hero.Replace('data-count="500"',  'data-count="500" data-cms-count="dictations"')
$hero = $hero.Replace('data-count="50"',   'data-count="50" data-cms-count="patterns"')
$hero = $hero.Replace('data-count="549"',  'data-count="549" data-cms-count="price"')
$pricing = [regex]::Replace($pricing, '<div class="price-big"><small>[^<]*</small>549</div>', '<div class="price-big"><small>&#8377;</small><span data-cms="price">549</span></div>')
$join = $join.Replace('<span>+91 73090 82749</span>', '<span data-cms="phone">+91 73090 82749</span>')
$join = $join.Replace('<span>fenxtekshorthandclasses20@gmail.com</span>', '<span data-cms="email">fenxtekshorthandclasses20@gmail.com</span>')
$join = $join.Replace('<span>@fenxtekshorthand_classes</span>', '<span data-cms="telegram">@fenxtekshorthand_classes</span>')
$join = $join.Replace('<span>@fenxtek_shorthand_classes</span>', '<span data-cms="instagram">@fenxtek_shorthand_classes</span>')
$director = $director.Replace('<span class="sec-note"><b>MK</b>Mohd. Kaif<br>Director</span>', '<span class="sec-note"><b>MK</b><span data-cms="directorName">Mohd. Kaif</span><br>Director</span>')
$director = $director.Replace('<div class="dir-cap"><span><b>Mohd. Kaif</b>Director · FenxTek</span>', '<div class="dir-cap"><span><b data-cms="directorName">Mohd. Kaif</b>Director · FenxTek</span>')
$director = $director.Replace('<p class="dir-msg">', '<p class="dir-msg" data-cms="directorMessage">')

# page-start spacing for pages that open straight into a section
$courses  = $courses.Replace('class="section section--ink on-dark" id="courses"',  'class="section section--ink on-dark page-start" id="courses"')
$method   = $method.Replace('class="section" id="method"',  'class="section page-start" id="method"')
$director = $director.Replace('class="section section--ink on-dark" id="director"', 'class="section section--ink on-dark page-start" id="director"')
$pricing  = $pricing.Replace('class="section pricing" id="pricing"', 'class="section pricing page-start" id="pricing"')
$join     = $join.Replace('class="section section--ink on-dark join" id="join"', 'class="section section--ink on-dark join page-start" id="join"')

$HOME_MAIN    = $hero + "`n" + $marquee + "`n" + $practice + "`n" + $explore + "`n" + $voices + "`n" + $cta
$COURSES_MAIN = $courses + "`n" + $cta
$EXAMS_MAIN   = $exams
$METHOD_MAIN  = $method + "`n" + $why + "`n" + $cta
$ABOUT_MAIN   = $director + "`n" + $voices + "`n" + $cta
$MEMB_MAIN    = $pricing + "`n" + $faq + "`n" + $cta
$CONTACT_MAIN = $join

$head = @'
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__</title>
<meta name="description" content="__DESC__">
<meta name="theme-color" content="#F5F1E8">
<link rel="icon" href="fenxtek-logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Tiro+Devanagari+Hindi:ital@0;1&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/site.css">
<noscript><style>.preloader{display:none}[data-reveal]{opacity:1;transform:none}.hero-head .l>span{transform:none}.menu{display:none}</style></noscript>
'@

$shell = @'
<!DOCTYPE html>
<html lang="en">
<head>
__HEAD__
</head>
<body data-page="__PAGE__">
<main>
__MAIN__
</main>
<script src="assets/js/chrome.js"></script>
<script src="assets/js/site.js"></script>
<script type="module" src="assets/js/content.js"></script>
<script type="module" src="assets/js/auth-ui.js"></script>
</body>
</html>
'@

function New-Page([string]$file, [string]$title, [string]$desc, [string]$pageId, [string]$main) {
  $main = Fix-Links $main
  $h = $head.Replace('__TITLE__', $title).Replace('__DESC__', $desc)
  $html = $shell.Replace('__HEAD__', $h).Replace('__PAGE__', $pageId).Replace('__MAIN__', $main)
  [System.IO.File]::WriteAllText((Join-Path $root $file), $html, $utf8)
  Write-Host ("wrote {0} ({1} bytes)" -f $file, $html.Length)
}

New-Page 'index.html' 'FenxTek Shorthand Classes - Master Shorthand & Typing' 'Exam-accurate Hindi & English shorthand dictations, typing practice and preparation for SSC, UPSSSC, AHC and 50+ government exam patterns.' 'home' $HOME_MAIN
New-Page 'courses.html' 'Courses & Fees - FenxTek Shorthand Classes' 'Live exam-focused shorthand batches and fees - SSC, UPSSSC, AHC, UPPCL, UPPSC and more.' 'courses' $COURSES_MAIN
New-Page 'exams.html' 'Exam Paths - FenxTek Shorthand Classes' 'Parliamentary, high court, central and state stenographer exam patterns covered by FenxTek.' 'exams' $EXAMS_MAIN
New-Page 'method.html' 'The Method - FenxTek Shorthand Classes' 'A three-step daily loop: choose your exam, practise at target speed, track improvement.' 'method' $METHOD_MAIN
New-Page 'about.html' 'About & Director - FenxTek Shorthand Classes' 'Meet Mohd. Kaif, Director of FenxTek Shorthand Classes, and the students who cleared their exams.' 'about' $ABOUT_MAIN
New-Page 'membership.html' 'Membership & FAQ - FenxTek Shorthand Classes' 'Unlimited access to all courses, dictations and mock tests from Rs 549, plus answers to common questions.' 'membership' $MEMB_MAIN
New-Page 'contact.html' 'Contact & Join - FenxTek Shorthand Classes' 'Talk to FenxTek on phone, email, Telegram or Instagram and start with a free demo dictation.' 'contact' $CONTACT_MAIN
