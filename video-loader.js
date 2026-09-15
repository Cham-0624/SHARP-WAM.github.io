(() => {
  const videos = [...document.querySelectorAll('.demo-card video')];
  const note = document.querySelector('.demo-subsection-heading p');
  const playbackRate = 1.5;

  if (note) note.textContent = 'During training, the policy uses head and wrist observations. For clear visualization, each inference clip shows third-person (left) and head-camera (right) views. All clips stream and autoplay silently at 1.5× speed; drag any timeline to inspect that clip.';

  function play(video) {
    video.muted = true;
    video.defaultPlaybackRate = playbackRate;
    video.playbackRate = playbackRate;
    video.play().catch(() => {});
  }

  function addScrubber(video) {
    const scrubber = document.createElement('input');
    scrubber.className = 'video-scrubber';
    scrubber.type = 'range';
    scrubber.min = '0';
    scrubber.max = '1000';
    scrubber.step = '1';
    scrubber.value = '0';
    scrubber.disabled = true;
    scrubber.setAttribute('aria-label', `Scrub ${video.getAttribute('aria-label') || 'simulation video'}`);
    video.insertAdjacentElement('afterend', scrubber);

    let scrubbing = false;
    let pendingSeek = false;
    const sync = () => {
      if (!scrubbing && !pendingSeek && Number.isFinite(video.duration) && video.duration > 0) {
        scrubber.value = String(Math.round(video.currentTime / video.duration * 1000));
      }
    };
    const commitSeek = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const targetTime = Number(scrubber.value) / 1000 * video.duration;
      if (Math.abs(video.currentTime - targetTime) < 0.02) {
        pendingSeek = false;
        scrubbing = false;
        sync();
        play(video);
        return;
      }
      pendingSeek = true;
      video.currentTime = targetTime;
    };
    video.addEventListener('loadedmetadata', () => { scrubber.disabled = false; sync(); });
    video.addEventListener('timeupdate', sync);
    video.addEventListener('seeked', () => {
      pendingSeek = false;
      scrubbing = false;
      sync();
      play(video);
    });
    scrubber.addEventListener('pointerdown', () => { scrubbing = true; });
    scrubber.addEventListener('input', () => { scrubbing = true; });
    scrubber.addEventListener('change', commitSeek);
    scrubber.addEventListener('blur', () => {
      if (scrubbing && !pendingSeek) commitSeek();
    });
  }

  videos.forEach(video => {
    // Keep the original MP4 source intact: playback begins once enough media is buffered.
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.controls = false;
    video.preload = 'auto';
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    addScrubber(video);
    video.addEventListener('loadedmetadata', () => play(video));
    video.addEventListener('loadeddata', () => play(video));
    video.addEventListener('canplay', () => play(video));
    video.addEventListener('ratechange', () => {
      if (video.playbackRate !== playbackRate) video.playbackRate = playbackRate;
    });
    video.addEventListener('play', () => {
      if (video.playbackRate !== playbackRate) video.playbackRate = playbackRate;
    });
    video.addEventListener('pause', () => {
      if (!document.hidden) window.setTimeout(() => play(video), 0);
    });
    video.addEventListener('pointerdown', () => videos.forEach(play));
    play(video);
  });

  window.addEventListener('pageshow', () => videos.forEach(play));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) videos.forEach(play);
  });
})();
