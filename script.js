document.addEventListener("DOMContentLoaded", function() {
    const slides = document.querySelectorAll('.slide');
    let currentSlide = 0;
    const slideInterval = 5000; // Change image every 5 seconds

    function nextSlide() {
        // Remove 'active' class from current slide
        slides[currentSlide].classList.remove('active');
        
        // Move to the next slide, loop back to 0 if at the end
        currentSlide = (currentSlide + 1) % slides.length;
        
        // Add 'active' class to the new slide
        slides[currentSlide].classList.add('active');
    }

    // Start the automatic slideshow
    setInterval(nextSlide, slideInterval);
});