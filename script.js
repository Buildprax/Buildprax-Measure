// BUILDPRAX MEASURE PRO - Website JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('.nav a[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add scroll effect to header
    let lastScrollTop = 0;
    const header = document.querySelector('.header');
    
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > lastScrollTop && scrollTop > 100) {
            // Scrolling down
            header.style.transform = 'translateY(-100%)';
        } else {
            // Scrolling up
            header.style.transform = 'translateY(0)';
        }
        
        lastScrollTop = scrollTop;
    });

    // Add intersection observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe feature cards and other elements
    const animatedElements = document.querySelectorAll('.feature-card, .download-card, .pricing-card, .support-card');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// Download Modal Functions
function showDownloadModal() {
    document.getElementById('downloadModal').style.display = 'block';
}

function closeDownloadModal() {
    document.getElementById('downloadModal').style.display = 'none';
}

// Payment Modal Functions
function showPaymentModal() {
    document.getElementById('paymentModal').style.display = 'block';
    initializePayPalButton();
}

function closePaymentModal() {
    document.getElementById('paymentModal').style.display = 'none';
}

// Close modals when clicking outside
window.onclick = function(event) {
    const downloadModal = document.getElementById('downloadModal');
    const paymentModal = document.getElementById('paymentModal');
    
    if (event.target === downloadModal) {
        closeDownloadModal();
    }
    if (event.target === paymentModal) {
        closePaymentModal();
    }
}

// Download Form Handler
document.addEventListener('DOMContentLoaded', function() {
    const downloadForm = document.getElementById('downloadForm');
    if (downloadForm) {
        downloadForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('userEmail').value;
            
            if (email) {
                // Store email for later use
                localStorage.setItem('userEmail', email);
                
                // Send download link
                sendDownloadLink(email);
                
                // Close modal
                closeDownloadModal();
                
                // Show success message
                alert('Download link sent to your email! Check your inbox.');
            }
        });
    }
});

// Send Download Link Function
function sendDownloadLink(email) {
    // In a real implementation, this would send an email
    // For now, we'll just log it and provide the download
    console.log('Sending download link to:', email);
    
    // Create download link
    const downloadLink = 'https://buildprax-downloads.sfo3.digitaloceanspaces.com/BUILDPRAX%20MEASURE%20PRO-1.0.0-arm64.dmg';
    
    // Create temporary download
    const link = document.createElement('a');
    link.href = downloadLink;
    link.download = 'BUILDPRAX MEASURE PRO-1.0.0-arm64.dmg';
    link.click();
    
    // Track download
    trackDownload(email);
}

// Track Download Function
function trackDownload(email) {
    // In a real implementation, this would send to analytics
    console.log('Download tracked for:', email);
    
    // Store in localStorage for now
    const downloads = JSON.parse(localStorage.getItem('downloads') || '[]');
    downloads.push({
        email: email,
        timestamp: new Date().toISOString(),
        type: 'trial_download'
    });
    localStorage.setItem('downloads', JSON.stringify(downloads));
}

// PayPal Button Initialization
function initializePayPalButton() {
    // Clear any existing buttons
    const container = document.getElementById('paypal-button-container');
    container.innerHTML = '';
    
    paypal.Buttons({
        createOrder: function(data, actions) {
            return actions.order.create({
                purchase_units: [{
                    amount: {
                        value: '299.00',
                        currency_code: 'USD'
                    },
                    description: 'BUILDPRAX MEASURE PRO - Pro License (1 Year)'
                }]
            });
        },
        onApprove: function(data, actions) {
            return actions.order.capture().then(function(details) {
                // Payment successful
                console.log('Payment completed:', details);
                
                // Get user email
                const userEmail = localStorage.getItem('userEmail') || details.payer.email_addresses[0].email_address;
                
                // Generate and send license key
                sendLicenseKey(userEmail, details);
                
                // Close modal
                closePaymentModal();
                
                // Show success message
                alert('Payment successful! Your license key has been sent to your email.');
            });
        },
        onError: function(err) {
            console.error('PayPal error:', err);
            alert('Payment failed. Please try again.');
        }
    }).render('#paypal-button-container');
}

// Send License Key Function
function sendLicenseKey(email, paymentDetails) {
    // Generate license key
    const licenseKey = generateLicenseKey();
    
    // In a real implementation, this would send an email
    console.log('Sending license key to:', email);
    console.log('License key:', licenseKey);
    
    // Track payment
    trackPayment(email, paymentDetails, licenseKey);
    
    // Store license key
    const licenses = JSON.parse(localStorage.getItem('licenses') || '[]');
    licenses.push({
        email: email,
        licenseKey: licenseKey,
        timestamp: new Date().toISOString(),
        paymentId: paymentDetails.id,
        amount: '299.00'
    });
    localStorage.setItem('licenses', JSON.stringify(licenses));
}

// Generate License Key Function
function generateLicenseKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
        if (i === 3 || i === 7 || i === 11) {
            result += '-';
        }
    }
    return result;
}

// Track Payment Function
function trackPayment(email, paymentDetails, licenseKey) {
    // In a real implementation, this would send to analytics
    console.log('Payment tracked for:', email);
    console.log('Payment details:', paymentDetails);
    console.log('License key generated:', licenseKey);
    
    // Store in localStorage for now
    const payments = JSON.parse(localStorage.getItem('payments') || '[]');
    payments.push({
        email: email,
        timestamp: new Date().toISOString(),
        type: 'pro_license',
        amount: '299.00',
        paymentId: paymentDetails.id,
        licenseKey: licenseKey
    });
    localStorage.setItem('payments', JSON.stringify(payments));
}

// Utility function to view stored data (for debugging)
function viewStoredData() {
    console.log('Downloads:', JSON.parse(localStorage.getItem('downloads') || '[]'));
    console.log('Payments:', JSON.parse(localStorage.getItem('payments') || '[]'));
    console.log('Licenses:', JSON.parse(localStorage.getItem('licenses') || '[]'));
}
