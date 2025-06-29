
// Optimized image configuration for demo images
export const demoImageConfig = {
  demo1: {
    src: "/demo1.png",
    srcDark: "/demo1_dark.png",
    alt: "ChordMini Beat and Chord Analysis Demo",
    width: 800,
    height: 450,
    priority: true,
    quality: 85,
    fetchPriority: "high",
    sizes: "(max-width: 768px) 400px, (max-width: 1200px) 600px, 800px",
    placeholder: "blur",
    blurDataURL: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
  },
  demo2: {
    src: "/demo2.png", 
    srcDark: "/demo2_dark.png",
    alt: "ChordMini Lyrics and Chord Synchronization Demo",
    width: 800,
    height: 450,
    priority: false,
    quality: 80,
    fetchPriority: "auto",
    sizes: "(max-width: 768px) 400px, (max-width: 1200px) 600px, 800px",
    placeholder: "blur",
    blurDataURL: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
  }
};