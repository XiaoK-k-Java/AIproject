public class lk07 {
    public int maxArea(int[] height) {
        int l = 0, r = height.length - 1, max = 0;
        while (l < r) {
            max = Math.max(max, (r - l) * Math.min(height[l], height[r]));
            if (height[l] < height[r]) l++;
            else r--;
        }
        return max;
    }

    public static void main(String[] args) {
        System.out.println(new lk07().maxArea(new int[]{1, 8, 6, 2, 5, 4, 8, 3, 7})); // 49
        System.out.println(new lk07().maxArea(new int[]{1, 1}));                        // 1
    }
}
