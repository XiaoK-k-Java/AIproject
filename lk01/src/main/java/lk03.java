public class lk03 {
    public static void main(String[] args) {
        // 示例1
        int[] nums1 = {3,2,3};
        System.out.println(majorityElement(nums1));

        // 示例2
        int[] nums2 = {2,2,1,1,1,2,2};
        System.out.println(majorityElement(nums2));
    }

    public static int majorityElement(int[] nums) {
        int candidate = 0;
        int count = 0;
        for (int num : nums) {
            if (count == 0) {
                candidate = num;
            }
            count += num == candidate ? 1 : -1;
        }
        return candidate;
    }
}
