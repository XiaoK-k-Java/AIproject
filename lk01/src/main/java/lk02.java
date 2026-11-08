import java.util.Scanner;

public class lk02 {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        System.out.println("请输入数组（数字用空格或逗号分隔，如 4,1,2,1,2）：");

        String line = in.nextLine().replace("[", "").replace("]", "").replace(",", " ").trim();

        int ans = 0;
        for (String s : line.split("\\s+")) {
            if (!s.isEmpty()) {
                ans ^= Integer.parseInt(s); // 相同数字异或成 0，最后只剩出现一次的那个
            }
        }
        System.out.println("只出现一次的数字是：" + ans);
    }
}
