public class lk04 {
    public static void main(String[] args) {
        // 测试用例
        int[] nums = {0, 1, 0, 3, 12};
        moveZeroes(nums);

        // 打印结果
        for (int num : nums) {
            System.out.print(num + " ");
        }
    }

    public static void moveZeroes(int[] nums) {
        int slow = 0;
        for (int fast = 0; fast < nums.length; fast++) {
            if (nums[fast] != 0) {
                // 交换
                int temp = nums[slow];
                nums[slow] = nums[fast];
                nums[fast] = temp;
                slow++;
            }
        }
    }
}
